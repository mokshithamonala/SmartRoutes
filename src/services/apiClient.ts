import type {
  CommunityReport,
  CompanionResponse,
  DiscoveredPOI,
  GeoPoint,
  JourneyStop,
  LiveNavigationSnapshot,
  LiveTrafficSnapshot,
  PredictiveRouteResult,
  RoutePreferences,
  UrbanContextData,
  UserPreferencesRecord,
  WeatherSnapshot,
} from "../types/mobility";
import { authFetch } from "./authClient";

async function safeParseJson<T>(res: Response, fallbackLabel: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!contentType.includes("application/json") && raw.trimStart().startsWith("<")) {
    throw new Error(
      `${fallbackLabel} returned an unexpected server response (HTTP ${res.status}). The backend may be restarting or busy — please retry in a moment.`,
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `${fallbackLabel} returned unreadable data (HTTP ${res.status}). Please retry.`,
    );
  }
}

export async function apiSearchLocations(
  query: string,
  near?: { lat: number; lng: number },
): Promise<GeoPoint[]> {
  const params = new URLSearchParams({ q: query, limit: "6" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lng", String(near.lng));
  }
  const res = await authFetch(`/api/geo/search?${params.toString()}`);
  const data = await safeParseJson<{ results?: GeoPoint[]; error?: string }>(
    res,
    "Location search",
  );
  if (!res.ok) throw new Error(data.error || "Location search failed");
  return data.results || [];
}

export async function apiReverseGeocode(
  lat: number,
  lng: number,
): Promise<GeoPoint> {
  const res = await authFetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Reverse geocode failed");
  return data.point;
}

export async function apiCalculateRoute(params: {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints?: JourneyStop[];
  preferences?: Partial<RoutePreferences>;
  isEmergency?: boolean;
}): Promise<PredictiveRouteResult> {
  const res = await authFetch("/api/routing/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Route calculation failed");
  return data as PredictiveRouteResult;
}

export async function apiDiscoverPOIs(params: {
  lat: number;
  lng: number;
  category: string;
  radiusMeters?: number;
  limit?: number;
}): Promise<DiscoveredPOI[]> {
  const q = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    category: params.category,
    radius: String(params.radiusMeters || 5000),
    limit: String(params.limit || 15),
  });
  const res = await authFetch(`/api/poi/search?${q.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Stop discovery failed (HTTP ${res.status})`);
  }
  return Array.isArray(data.pois) ? data.pois : [];
}

export async function apiFetchUrbanContext(
  lat: number,
  lng: number,
  radius = 650,
): Promise<UrbanContextData> {
  const res = await authFetch(
    `/api/geo/urban-context?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&radius=${radius}`,
  );
  const data = await res.json();
  if (!res.ok) {
    return {
      source: "Unavailable",
      fetchedAt: Date.now(),
      centerLat: lat,
      centerLng: lng,
      buildings: [],
      roads: [],
      parks: [],
      waterBodies: [],
      trees: [],
      landmarks: [],
      terrain: null,
      isFallbackGrid: true,
    };
  }
  return data as UrbanContextData;
}

export async function apiFetchWeather(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot> {
  const res = await authFetch(
    `/api/weather?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`,
  );
  return (await res.json()) as WeatherSnapshot;
}

export async function apiFetchTraffic(
  lat: number,
  lng: number,
): Promise<LiveTrafficSnapshot> {
  try {
    const res = await authFetch(
      `/api/traffic?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`,
    );
    return (await res.json()) as LiveTrafficSnapshot;
  } catch {
    return {
      available: false,
      provider: "TomTom Live Traffic API",
      fetchedAt: Date.now(),
      location: { lat, lng },
      flow: null,
      incidents: [],
      reason: "Live traffic endpoint unreachable; using OSRM road-speed estimates.",
    };
  }
}

function compactRouteForCompanion(
  route: PredictiveRouteResult | null | undefined,
): PredictiveRouteResult | null | undefined {
  if (!route) return route;
  return {
    ...route,
    alternatives: route.alternatives.map((alt) => {
      // Keep up to 30 sampled geometry points (sufficient for safety corridor checks) to keep payload light
      const geom = alt.geometry || [];
      const sampled =
        geom.length <= 30
          ? geom
          : geom.filter((_, i) => i === 0 || i === geom.length - 1 || i % Math.ceil(geom.length / 28) === 0);
      return {
        ...alt,
        geometry: sampled,
        steps: (alt.steps || []).slice(0, 25),
      };
    }),
  };
}

export async function apiAskCompanion(params: {
  message: string;
  activeRoute?: PredictiveRouteResult | null;
  selectedRouteId?: string | null;
  communityReports?: CommunityReport[];
  preferences?: Partial<UserPreferencesRecord> | null;
  userLocation?: { lat: number; lng: number } | null;
  liveNavigation?: LiveNavigationSnapshot | null;
  liveTraffic?: LiveTrafficSnapshot | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<CompanionResponse> {
  const payload = JSON.stringify({
    message: params.message,
    context: {
      activeRoute: compactRouteForCompanion(params.activeRoute),
      selectedRouteId: params.selectedRouteId,
      communityReports: (params.communityReports || []).slice(0, 25),
      preferences: params.preferences,
      userLocation: params.userLocation,
      liveNavigation: params.liveNavigation,
      liveTraffic: params.liveTraffic,
      history: params.history,
    },
  });

  // Attempt once; if a reverse proxy returns transient HTML (e.g., 502/504 during warmup), retry once
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await authFetch("/api/ai/companion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    const contentType = res.headers.get("content-type") || "";
    const raw = await res.text();
    const isHtml = !contentType.includes("application/json") && raw.trimStart().startsWith("<");

    if (isHtml) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 900));
        continue;
      }
      return {
        reply: "",
        agentsUsed: [],
        toolTraces: [],
        mapActions: [],
        error: `AI Companion request timed out or backend server was momentarily unavailable (HTTP ${res.status}). Please click Send to try again.`,
      };
    }

    try {
      return JSON.parse(raw) as CompanionResponse;
    } catch {
      return {
        reply: "",
        agentsUsed: [],
        toolTraces: [],
        mapActions: [],
        error: `AI Companion returned an invalid response (HTTP ${res.status}). Please retry.`,
      };
    }
  }

  return {
    reply: "",
    agentsUsed: [],
    toolTraces: [],
    mapActions: [],
    error: "AI Companion could not be reached. Please try again.",
  };
}
