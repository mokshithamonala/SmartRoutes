import type {
  CommunityReport,
  CompanionResponse,
  DiscoveredPOI,
  GeoPoint,
  JourneyStop,
  PredictiveRouteResult,
  RoutePreferences,
  UrbanContextData,
  UserPreferencesRecord,
  WeatherSnapshot,
} from "../types/mobility";

export async function apiSearchLocations(
  query: string,
  near?: { lat: number; lng: number },
): Promise<GeoPoint[]> {
  const params = new URLSearchParams({ q: query, limit: "6" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lng", String(near.lng));
  }
  const res = await fetch(`/api/geo/search?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Location search failed");
  return data.results || [];
}

export async function apiReverseGeocode(
  lat: number,
  lng: number,
): Promise<GeoPoint> {
  const res = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
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
  const res = await fetch("/api/routing/calculate", {
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
    radius: String(params.radiusMeters || 3500),
    limit: String(params.limit || 12),
  });
  const res = await fetch(`/api/poi/search?${q.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Stop discovery failed");
  return data.pois || [];
}

export async function apiFetchUrbanContext(
  lat: number,
  lng: number,
  radius = 650,
): Promise<UrbanContextData> {
  const res = await fetch(
    `/api/geo/urban-context?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&radius=${radius}`,
  );
  const data = await res.json();
  if (!res.ok) {
    return {
      source: "Unavailable",
      fetchedAt: Date.now(),
      buildings: [],
      roads: [],
      isFallbackGrid: true,
    };
  }
  return data as UrbanContextData;
}

export async function apiFetchWeather(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot> {
  const res = await fetch(
    `/api/weather?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`,
  );
  return (await res.json()) as WeatherSnapshot;
}

export async function apiAskCompanion(params: {
  message: string;
  activeRoute?: PredictiveRouteResult | null;
  selectedRouteId?: string | null;
  communityReports?: CommunityReport[];
  preferences?: Partial<UserPreferencesRecord> | null;
  userLocation?: { lat: number; lng: number } | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<CompanionResponse> {
  const res = await fetch("/api/ai/companion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: params.message,
      context: {
        activeRoute: params.activeRoute,
        selectedRouteId: params.selectedRouteId,
        communityReports: params.communityReports,
        preferences: params.preferences,
        userLocation: params.userLocation,
        history: params.history,
      },
    }),
  });
  const data = (await res.json()) as CompanionResponse;
  return data;
}
