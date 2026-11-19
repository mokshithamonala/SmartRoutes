import type {
  GeoPoint,
  JourneyStop,
  PredictiveRouteResult,
  RouteAlternative,
  RoutePreferences,
  TurnComplexityAnalysis,
} from "../../src/types/mobility";

const NOMINATIM_BASE = (
  process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org"
).replace(/\/$/, "");

export function resolveOsrmBaseUrl(): string {
  const raw = (process.env.OSRM_BASE_URL || "").trim();
  if (!raw) return "https://router.project-osrm.org";
  try {
    const parsed = new URL(raw);
    // Guard against misconfigured marketing website URL (project-osrm.org instead of router.project-osrm.org)
    if (
      parsed.hostname === "project-osrm.org" ||
      parsed.hostname === "www.project-osrm.org"
    ) {
      return "https://router.project-osrm.org";
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return "https://router.project-osrm.org";
  }
}

const OSRM_BASE = resolveOsrmBaseUrl();

const USER_AGENT = "SmartRoutes/3.0 (AI Mobility Platform; OpenStreetMap Integration)";

// Rate limiter for Nominatim (respects 1 req/sec policy)
let lastNominatimCall = 0;
const geoCache = new Map<string, { expires: number; data: any }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function waitForNominatimSlot(): Promise<void> {
  const now = Date.now();
  const delta = now - lastNominatimCall;
  if (delta < 1050) {
    await new Promise((resolve) => setTimeout(resolve, 1050 - delta));
  }
  lastNominatimCall = Date.now();
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export async function searchLocations(
  query: string,
  limit = 6,
  near?: { lat: number; lng: number },
): Promise<GeoPoint[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const cacheKey = `search:${trimmed.toLowerCase()}:${limit}:${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""}`;
  const cached = geoCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  await waitForNominatimSlot();

  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(Math.min(Math.max(limit, 1), 10)),
  });

  if (near) {
    const d = 0.35;
    params.set(
      "viewbox",
      `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`,
    );
  }

  const res = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`Nominatim search failed (${res.status})`);
  }

  const rows = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    name?: string;
  }>;

  const results: GeoPoint[] = rows.map((row) => ({
    lat: Number(row.lat),
    lng: Number(row.lon),
    address: row.display_name,
    label: row.name || row.display_name.split(",")[0],
  }));

  geoCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, data: results });
  return results;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeoPoint> {
  const cacheKey = `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = geoCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  await waitForNominatimSlot();

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "jsonv2",
  });

  try {
    const res = await fetch(`${NOMINATIM_BASE}/reverse?${params.toString()}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`Nominatim reverse failed (${res.status})`);
    }
    const data = (await res.json()) as {
      display_name?: string;
      name?: string;
    };
    const point: GeoPoint = {
      lat,
      lng,
      address: data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      label: data.name || data.display_name?.split(",")[0] || "Selected Location",
    };
    geoCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, data: point });
    return point;
  } catch {
    return {
      lat,
      lng,
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      label: "Selected Location",
    };
  }
}

function optimizeWaypointOrder(
  origin: GeoPoint,
  waypoints: JourneyStop[],
  destination: GeoPoint,
): JourneyStop[] {
  if (waypoints.length <= 1) return waypoints;
  const remaining = [...waypoints];
  const ordered: JourneyStop[] = [];
  let current = { lat: origin.lat, lng: origin.lng };

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const distFromCurrent = haversineKm(
        current.lat,
        current.lng,
        remaining[i].lat,
        remaining[i].lng,
      );
      const distToDest = haversineKm(
        remaining[i].lat,
        remaining[i].lng,
        destination.lat,
        destination.lng,
      );
      // Favor stops closest to current while progressing toward destination
      const score = distFromCurrent - distToDest * 0.15;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = { lat: next.lat, lng: next.lng };
  }
  return ordered;
}

function analyzeTurns(legs: any[]): TurnComplexityAnalysis {
  let totalSteps = 0;
  let maneuverCount = 0;
  let sharpTurns = 0;
  let roundabouts = 0;
  let mergesAndRamps = 0;
  const roadNames = new Set<string>();

  for (const leg of legs || []) {
    for (const step of leg.steps || []) {
      totalSteps++;
      if (step.name && typeof step.name === "string" && step.name.trim()) {
        roadNames.add(step.name.trim());
      }
      const mType = step.maneuver?.type || "";
      const modifier = step.maneuver?.modifier || "";
      if (mType !== "depart" && mType !== "arrive") {
        maneuverCount++;
      }
      if (
        modifier.includes("sharp") ||
        modifier === "uturn" ||
        (mType === "turn" && modifier === "left")
      ) {
        sharpTurns++;
      }
      if (mType.includes("roundabout") || mType === "rotary") {
        roundabouts++;
      }
      if (mType === "merge" || mType === "on ramp" || mType === "off ramp" || mType === "fork") {
        mergesAndRamps++;
      }
    }
  }

  const rawScore = Math.min(
    100,
    Math.round(
      maneuverCount * 2.2 + sharpTurns * 6 + roundabouts * 7 + mergesAndRamps * 4,
    ),
  );
  const complexityLabel: "Low" | "Moderate" | "High" =
    rawScore <= 30 ? "Low" : rawScore <= 62 ? "Moderate" : "High";

  return {
    totalSteps,
    maneuverCount,
    sharpTurns,
    roundabouts,
    mergesAndRamps,
    complexityScore: rawScore,
    complexityLabel,
    roadSummary: Array.from(roadNames).slice(0, 6),
  };
}

function downsampleCoordinates(
  coords: Array<[number, number]>,
  maxPoints = 320,
): Array<[number, number]> {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(coords.length - 1, Math.round(i * step));
    out.push(coords[idx]);
  }
  return out;
}

export async function calculatePredictiveRoute(params: {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints?: JourneyStop[];
  preferences?: Partial<RoutePreferences>;
  isEmergency?: boolean;
}): Promise<PredictiveRouteResult> {
  const { origin, destination, isEmergency = false } = params;
  const preferences: RoutePreferences = {
    routeType: params.preferences?.routeType || "fastest",
    avoidTolls: Boolean(params.preferences?.avoidTolls),
    avoidHighways: Boolean(params.preferences?.avoidHighways),
    optimizeStopOrder: params.preferences?.optimizeStopOrder ?? false,
  };

  let waypoints = params.waypoints || [];
  if (preferences.optimizeStopOrder && waypoints.length > 1) {
    waypoints = optimizeWaypointOrder(origin, waypoints, destination);
  }

  const orderedPoints = [origin, ...waypoints, destination];
  const coordStr = orderedPoints
    .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
    .join(";");

  const url = new URL(`${OSRM_BASE}/route/v1/driving/${coordStr}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");
  url.searchParams.set("alternatives", waypoints.length === 0 ? "3" : "true");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`OSRM routing service returned HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    code: string;
    message?: string;
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: Array<[number, number]> };
      legs: any[];
    }>;
  };

  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error(data.message || "No drivable route found between these coordinates.");
  }

  const rawAlternatives = data.routes.map((route, idx) => {
    const distanceKm = Number((route.distance / 1000).toFixed(2));
    const durationMin = Math.max(1, Math.round(route.duration / 60));
    const estimatedAvgSpeedKmh = Math.max(
      5,
      Math.round((distanceKm / Math.max(route.duration / 3600, 0.01))),
    );
    const geometry: Array<[number, number]> = downsampleCoordinates(
      route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    );
    const turns = analyzeTurns(route.legs);

    return {
      routeId: `osrm_route_${idx + 1}`,
      distanceKm,
      durationMin,
      estimatedAvgSpeedKmh,
      geometry,
      turns,
    };
  });

  const minDuration = Math.min(...rawAlternatives.map((r) => r.durationMin));
  const minDistance = Math.min(...rawAlternatives.map((r) => r.distanceKm));
  const minComplexity = Math.min(
    ...rawAlternatives.map((r) => r.turns.complexityScore),
  );

  const alternatives: RouteAlternative[] = rawAlternatives.map((r, idx) => {
    const isFastest = r.durationMin === minDuration;
    const isShortest = r.distanceKm === minDistance;
    const isLowestComplexity = r.turns.complexityScore === minComplexity;

    const timeEfficiency = Math.round(
      Math.min(100, (minDuration / Math.max(r.durationMin, 1)) * 100),
    );
    const distanceEfficiency = Math.round(
      Math.min(100, (minDistance / Math.max(r.distanceKm, 0.1)) * 100),
    );
    const turnSimplicity = Math.max(10, 100 - r.turns.complexityScore);

    let qualityScore = Math.round(
      timeEfficiency * 0.45 + distanceEfficiency * 0.25 + turnSimplicity * 0.3,
    );
    if (preferences.routeType === "shortest") {
      qualityScore = Math.round(
        distanceEfficiency * 0.55 + timeEfficiency * 0.25 + turnSimplicity * 0.2,
      );
    } else if (preferences.routeType === "balanced") {
      qualityScore = Math.round(
        turnSimplicity * 0.45 + timeEfficiency * 0.35 + distanceEfficiency * 0.2,
      );
    } else if (isEmergency) {
      qualityScore = Math.round(timeEfficiency * 0.7 + turnSimplicity * 0.3);
    }

    const tags: string[] = [];
    if (isFastest) tags.push("Fastest Estimate");
    if (isShortest) tags.push("Shortest Distance");
    if (isLowestComplexity) tags.push("Simplest Turns");
    if (isEmergency) tags.push("Emergency Candidate");

    const roadHint =
      r.turns.roadSummary.length > 0
        ? `via ${r.turns.roadSummary.slice(0, 2).join(" & ")}`
        : `Option ${idx + 1}`;

    const reasons: string[] = [];
    if (isFastest) reasons.push(`lowest OSRM estimated travel time (${r.durationMin} min)`);
    if (isShortest) reasons.push(`shortest road distance (${r.distanceKm} km)`);
    if (isLowestComplexity) {
      reasons.push(
        `lowest turn complexity (${r.turns.maneuverCount} maneuvers, ${r.turns.sharpTurns} sharp/left turns)`,
      );
    }
    if (reasons.length === 0) {
      reasons.push(
        `${r.distanceKm} km, ~${r.durationMin} min with ${r.turns.maneuverCount} maneuvers`,
      );
    }

    return {
      ...r,
      label: `${idx === 0 ? "Primary" : `Alternative ${idx}`} ${roadHint}`,
      qualityScore,
      scoreBreakdown: {
        timeEfficiency,
        distanceEfficiency,
        turnSimplicity,
      },
      tags,
      explanation: `Scored ${qualityScore}/100 (${preferences.routeType} preference): ${reasons.join(", ")}.`,
      isRecommended: false,
      isFastest,
      isShortest,
      isLowestComplexity,
      timingDisclaimer:
        "Estimated from OpenStreetMap road geometry & speed limits via OSRM (does not include verified live traffic feeds).",
    };
  });

  // Choose recommended route based on highest qualityScore
  let bestIndex = 0;
  for (let i = 1; i < alternatives.length; i++) {
    if (alternatives[i].qualityScore > alternatives[bestIndex].qualityScore) {
      bestIndex = i;
    }
  }
  alternatives[bestIndex].isRecommended = true;

  const notePrefs: string[] = [];
  if (preferences.avoidTolls || preferences.avoidHighways) {
    notePrefs.push(
      "Note: Public OSRM driving profile does not natively exclude tolls/highways; preference is reflected in route scoring and briefing.",
    );
  }

  return {
    origin,
    destination,
    waypoints,
    alternatives,
    recommendedRouteId: alternatives[bestIndex].routeId,
    predictionConfidence: alternatives.length > 1 ? "High" : "Moderate",
    confidenceReason:
      notePrefs.length > 0
        ? notePrefs.join(" ")
        : "Calculated from OpenStreetMap road graph geometry and maneuver steps via OSRM. Actual travel time varies with real-world traffic.",
    provider: `OSRM (${OSRM_BASE})`,
    calculatedAt: Date.now(),
    isEmergency,
  };
}
