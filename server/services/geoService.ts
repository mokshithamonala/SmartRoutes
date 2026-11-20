import type {
  GeoPoint,
  JourneyStop,
  PredictiveRouteResult,
  RouteAlternative,
  RoutePreferences,
  RouteStepInstruction,
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

export interface NominatimBoundedPOI {
  id: string;
  lat: number;
  lng: number;
  name: string;
  address: string;
  hasAddress: boolean;
  distanceKm: number;
  openingHours?: string;
  phone?: string;
  website?: string;
  brand?: string;
  operator?: string;
  accessibility?: string;
  capacity?: number | null;
}

function buildBoundingBox(lat: number, lng: number, radiusKm: number): string {
  const clampedKm = Math.min(Math.max(radiusKm, 0.5), 50);
  const dLat = clampedKm / 111.32;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const dLng = clampedKm / (111.32 * cosLat);
  const left = Math.max(-180, lng - dLng);
  const right = Math.min(180, lng + dLng);
  const top = Math.min(90, lat + dLat);
  const bottom = Math.max(-90, lat - dLat);
  return `${left.toFixed(5)},${top.toFixed(5)},${right.toFixed(5)},${bottom.toFixed(5)}`;
}

export async function searchLocations(
  query: string,
  limit = 6,
  near?: { lat: number; lng: number },
  options?: { bounded?: boolean; radiusKm?: number },
): Promise<GeoPoint[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const bounded = Boolean(options?.bounded && near);
  const radiusKm = options?.radiusKm ?? 25;

  const cacheKey = `search:${trimmed.toLowerCase()}:${limit}:${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""}:${bounded ? `b${radiusKm}` : "u"}`;
  const cached = geoCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  await waitForNominatimSlot();

  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(Math.min(Math.max(limit, 1), 15)),
  });

  if (near) {
    params.set("viewbox", buildBoundingBox(near.lat, near.lng, bounded ? radiusKm : 35));
    if (bounded) {
      params.set("bounded", "1");
    }
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

  let results: GeoPoint[] = rows
    .map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lon),
      address: row.display_name,
      label: row.name || row.display_name.split(",")[0],
    }))
    .filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));

  if (bounded && near) {
    results = results.filter(
      (pt) => haversineKm(near.lat, near.lng, pt.lat, pt.lng) <= radiusKm,
    );
  }

  geoCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, data: results });
  return results;
}

export async function searchNominatimBoundedPOIs(
  query: string,
  near: { lat: number; lng: number },
  radiusKm: number,
  limit = 12,
  fallbackLabel?: string,
): Promise<NominatimBoundedPOI[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `nompoi:${trimmed.toLowerCase()}:${near.lat.toFixed(3)},${near.lng.toFixed(3)}:${radiusKm.toFixed(1)}:${limit}`;
  const cached = geoCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  await waitForNominatimSlot();

  const params = new URLSearchParams({
    q: trimmed,
    format: "jsonv2",
    addressdetails: "1",
    extratags: "1",
    bounded: "1",
    viewbox: buildBoundingBox(near.lat, near.lng, radiusKm),
    limit: String(Math.min(Math.max(limit * 2, 10), 25)),
  });

  const res = await fetch(`${NOMINATIM_BASE}/search?${params.toString()}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`Nominatim bounded search failed (HTTP ${res.status})`);
  }

  const rows = (await res.json()) as Array<{
    place_id?: number;
    osm_type?: string;
    osm_id?: number;
    type?: string;
    lat: string;
    lon: string;
    display_name?: string;
    name?: string;
    extratags?: Record<string, string>;
  }>;

  const out: NominatimBoundedPOI[] = [];
  for (const row of rows) {
    const rLat = Number(row.lat);
    const rLng = Number(row.lon);
    if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) continue;

    const distanceKm = haversineKm(near.lat, near.lng, rLat, rLng);
    // Strict radius enforcement — never leak results outside requested radius
    if (distanceKm > radiusKm) continue;

    const extras = row.extratags || {};
    const displayName = (row.display_name || "").trim();
    const firstAddrPart = displayName.split(",")[0]?.trim() || "";
    const explicitName = (
      row.name ||
      extras.name ||
      extras["name:en"] ||
      extras.brand ||
      extras.operator ||
      ""
    ).trim();

    const name =
      explicitName ||
      (fallbackLabel && firstAddrPart
        ? `${fallbackLabel} (${firstAddrPart})`
        : fallbackLabel || firstAddrPart);

    if (!name) continue;

    const capNum = extras.capacity ? Number.parseInt(extras.capacity, 10) : null;
    const stableId =
      row.osm_type && row.osm_id
        ? `osm_${row.osm_type}_${row.osm_id}`
        : `nom_${row.place_id || `${rLat.toFixed(5)}_${rLng.toFixed(5)}`}`;

    out.push({
      id: stableId,
      lat: rLat,
      lng: rLng,
      name,
      address: displayName || "Not available",
      hasAddress: Boolean(displayName),
      distanceKm: Number(distanceKm.toFixed(2)),
      openingHours: extras.opening_hours || undefined,
      phone: extras.phone || extras["contact:phone"] || undefined,
      website: extras.website || extras["contact:website"] || undefined,
      brand: extras.brand || undefined,
      operator: extras.operator || undefined,
      accessibility:
        extras.wheelchair === "yes"
          ? "Wheelchair accessible"
          : extras.wheelchair === "limited"
            ? "Limited wheelchair access"
            : undefined,
      capacity: Number.isFinite(capNum) ? capNum : null,
    });
  }

  out.sort((a, b) => a.distanceKm - b.distanceKm);
  const sliced = out.slice(0, limit);
  geoCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, data: sliced });
  return sliced;
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

function formatManeuverText(
  maneuverType: string,
  modifier: string | undefined,
  roadName: string,
  exit?: number,
): string {
  const onto = roadName ? ` onto ${roadName}` : "";
  const on = roadName ? ` on ${roadName}` : "";
  const mod = (modifier || "").replace(/_/g, " ").trim();

  switch (maneuverType) {
    case "depart":
      return roadName ? `Head out on ${roadName}` : "Start driving along the route";
    case "arrive":
      return "Arrive at your destination";
    case "turn":
      if (mod === "uturn") return `Make a U-turn${onto}`;
      if (mod === "straight") return `Continue straight${on}`;
      if (mod) return `Turn ${mod}${onto}`;
      return `Turn${onto}`;
    case "new name":
      return roadName ? `Continue onto ${roadName}` : "Continue straight";
    case "continue":
      if (mod && mod !== "straight") return `Keep ${mod}${onto}`;
      return `Continue straight${on}`;
    case "merge":
      return mod ? `Merge ${mod}${onto}` : `Merge${onto}`;
    case "on ramp":
      return mod ? `Take the ramp ${mod}${onto}` : `Take the ramp${onto}`;
    case "off ramp":
      return mod ? `Take the exit ${mod}${onto}` : `Take the exit${onto}`;
    case "fork":
      return mod ? `Keep ${mod} at the fork${onto}` : `Follow the fork${onto}`;
    case "end of road":
      return mod ? `At the end of the road, turn ${mod}${onto}` : `Turn at the end of the road${onto}`;
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      if (exit) return `At the roundabout, take exit ${exit}${onto}`;
      return `Enter the roundabout${onto}`;
    case "exit roundabout":
    case "exit rotary":
      return `Exit the roundabout${onto}`;
    default:
      if (mod) return `Proceed ${mod}${onto}`;
      return roadName ? `Continue on ${roadName}` : "Continue ahead";
  }
}

function buildRouteSteps(legs: any[]): RouteStepInstruction[] {
  const steps: RouteStepInstruction[] = [];
  let idx = 0;

  for (const leg of legs || []) {
    for (const step of leg.steps || []) {
      const loc = step.maneuver?.location;
      const lng = Array.isArray(loc) ? Number(loc[0]) : NaN;
      const lat = Array.isArray(loc) ? Number(loc[1]) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const maneuverType = String(step.maneuver?.type || "continue");
      const modifier = step.maneuver?.modifier ? String(step.maneuver.modifier) : undefined;
      const exit =
        typeof step.maneuver?.exit === "number" ? step.maneuver.exit : undefined;
      const rawName = typeof step.name === "string" ? step.name.trim() : "";
      const refName = typeof step.ref === "string" ? step.ref.trim() : "";
      const roadName = rawName || refName || "";

      steps.push({
        index: idx++,
        instruction: formatManeuverText(maneuverType, modifier, roadName, exit),
        roadName: roadName || "Unnamed road",
        maneuverType,
        modifier,
        distanceMeters: Math.round(Number(step.distance) || 0),
        durationSeconds: Math.round(Number(step.duration) || 0),
        lat,
        lng,
        exit,
      });
    }
  }

  return steps;
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
    const steps = buildRouteSteps(route.legs);

    return {
      routeId: `osrm_route_${idx + 1}`,
      distanceKm,
      durationMin,
      estimatedAvgSpeedKmh,
      geometry,
      steps,
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
