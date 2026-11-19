import type {
  DiscoveredPOI,
  UrbanBuilding,
  UrbanContextData,
  UrbanRoad,
} from "../../src/types/mobility";
import { haversineKm, searchLocations } from "./geoService";

const OVERPASS_ENDPOINTS = Array.from(
  new Set([
    process.env.OVERPASS_BASE_URL || "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ]),
);

const USER_AGENT = "SmartRoutes/3.0 (OpenStreetMap Overpass Integration)";
const poiCache = new Map<string, { expires: number; data: any }>();
const TTL_MS = 5 * 60 * 1000;

async function queryOverpass(ql: string): Promise<any> {
  const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ data: ql }).toString(),
      signal: AbortSignal.timeout(4800),
    });
    if (!res.ok) {
      throw new Error(`Overpass HTTP ${res.status}`);
    }
    return res.json();
  });
  return Promise.any(attempts);
}

function buildOverpassFilter(
  category: string,
  lat: number,
  lng: number,
  radiusMeters: number,
): string {
  const around = `(around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)})`;
  switch (category) {
    case "parking":
      return `nwr["amenity"="parking"]${around};`;
    case "fuel":
      return `nwr["amenity"="fuel"]${around};`;
    case "charging":
      return `nwr["amenity"="charging_station"]${around};`;
    case "rest":
      return `nwr["highway"="rest_area"]${around};nwr["highway"="services"]${around};nwr["amenity"="cafe"]${around};`;
    case "food":
      return `nwr["amenity"="restaurant"]${around};nwr["amenity"="fast_food"]${around};nwr["amenity"="cafe"]${around};`;
    case "service":
      return `nwr["shop"="car_repair"]${around};nwr["amenity"="car_wash"]${around};`;
    case "hospital":
      return `nwr["amenity"="hospital"]${around};nwr["amenity"="clinic"]${around};`;
    case "police":
      return `nwr["amenity"="police"]${around};`;
    case "emergency":
      return `nwr["amenity"="hospital"]${around};nwr["amenity"="police"]${around};nwr["amenity"="fire_station"]${around};`;
    default:
      return `nwr["amenity"="parking"]${around};nwr["amenity"="fuel"]${around};nwr["amenity"="charging_station"]${around};`;
  }
}

function normalizeCategory(
  requested: string,
  tags: Record<string, string>,
): DiscoveredPOI["category"] {
  const amenity = tags.amenity || "";
  if (amenity === "hospital" || amenity === "clinic") return "hospital";
  if (amenity === "police") return "police";
  if (amenity === "fire_station") return "fire";
  if (amenity === "parking") return "parking";
  if (amenity === "fuel") return "fuel";
  if (amenity === "charging_station") return "charging";
  if (amenity === "restaurant" || amenity === "fast_food") return "food";
  if (amenity === "cafe" || tags.highway === "rest_area" || tags.highway === "services") return "rest";
  if (tags.shop === "car_repair" || amenity === "car_wash") return "service";
  if (
    requested === "parking" ||
    requested === "fuel" ||
    requested === "charging" ||
    requested === "rest" ||
    requested === "food" ||
    requested === "service" ||
    requested === "hospital" ||
    requested === "police"
  ) {
    return requested;
  }
  return "parking";
}

function formatAddress(tags: Record<string, string>, lat: number, lng: number): string {
  const parts = [
    tags["addr:housenumber"] && tags["addr:street"]
      ? `${tags["addr:housenumber"]} ${tags["addr:street"]}`
      : tags["addr:street"],
    tags["addr:city"] || tags["addr:suburb"],
    tags["addr:state"],
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export async function discoverPOIs(params: {
  lat: number;
  lng: number;
  category: string;
  radiusMeters?: number;
  limit?: number;
}): Promise<DiscoveredPOI[]> {
  const { lat, lng, category } = params;
  const radiusMeters = Math.min(Math.max(params.radiusMeters || 3500, 500), 15000);
  const limit = Math.min(Math.max(params.limit || 12, 1), 25);

  const cacheKey = `poi:${category}:${lat.toFixed(3)},${lng.toFixed(3)}:${radiusMeters}`;
  const cached = poiCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const filter = buildOverpassFilter(category, lat, lng, radiusMeters);
  const ql = `[out:json][timeout:8];(${filter});out center ${limit * 2};`;

  try {
    const json = await queryOverpass(ql);
    const elements = Array.isArray(json.elements) ? json.elements : [];

    const seen = new Set<string>();
    const results: DiscoveredPOI[] = [];

    for (const el of elements) {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (typeof elLat !== "number" || typeof elLng !== "number") continue;

      const tags: Record<string, string> = el.tags || {};
      const normCat = normalizeCategory(category, tags);
      const rawName =
        tags.name ||
        tags.brand ||
        tags.operator ||
        `${normCat.charAt(0).toUpperCase() + normCat.slice(1)} Location`;

      const dedupeKey = `${rawName.toLowerCase()}:${elLat.toFixed(3)}:${elLng.toFixed(3)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const capNum = tags.capacity ? Number.parseInt(tags.capacity, 10) : null;

      results.push({
        id: `osm_${el.type}_${el.id}`,
        name: rawName,
        category: normCat,
        lat: elLat,
        lng: elLng,
        address: formatAddress(tags, elLat, elLng),
        distanceKm: Number(haversineKm(lat, lng, elLat, elLng).toFixed(2)),
        accessibility:
          tags.wheelchair === "yes"
            ? "Wheelchair accessible"
            : tags.wheelchair === "limited"
              ? "Limited wheelchair access"
              : undefined,
        openingHours: tags.opening_hours || undefined,
        capacity: Number.isFinite(capNum) ? capNum : null,
        availabilityStatus:
          normCat === "parking" || normCat === "charging"
            ? "Unknown (no live sensor feed)"
            : "Verify hours on arrival",
        source: "OpenStreetMap Overpass",
        phone: tags.phone || tags["contact:phone"] || undefined,
      });
    }

    results.sort((a, b) => a.distanceKm - b.distanceKm);
    const trimmed = results.slice(0, limit);
    if (trimmed.length > 0) {
      poiCache.set(cacheKey, { expires: Date.now() + TTL_MS, data: trimmed });
      return trimmed;
    }
  } catch {
    // Fall back to Nominatim bounded search when Overpass is rate-limited
  }

  // Fallback via OpenStreetMap Nominatim bounded search
  const keywordMap: Record<string, string> = {
    parking: "parking",
    fuel: "gas station",
    charging: "ev charging station",
    rest: "rest area cafe",
    food: "restaurant",
    service: "auto repair",
    hospital: "hospital",
    police: "police station",
    emergency: "hospital",
  };
  const kw = keywordMap[category] || "parking";
  try {
    const nominatimRows = await searchLocations(kw, Math.min(limit, 8), { lat, lng });
    const mapped: DiscoveredPOI[] = nominatimRows
      .map((row, idx) => ({
        id: `nom_${category}_${idx}_${row.lat.toFixed(4)}`,
        name: row.label || row.address.split(",")[0],
        category: normalizeCategory(category, {}),
        lat: row.lat,
        lng: row.lng,
        address: row.address,
        distanceKm: Number(haversineKm(lat, lng, row.lat, row.lng).toFixed(2)),
        availabilityStatus:
          category === "parking" || category === "charging"
            ? "Unknown (no live sensor feed)"
            : "Verify hours on arrival",
        source: "OpenStreetMap Nominatim" as const,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    poiCache.set(cacheKey, { expires: Date.now() + TTL_MS, data: mapped });
    return mapped;
  } catch {
    return [];
  }
}

export async function fetchUrbanContext(params: {
  centerLat: number;
  centerLng: number;
  radiusMeters?: number;
}): Promise<UrbanContextData> {
  const { centerLat, centerLng } = params;
  const radius = Math.min(Math.max(params.radiusMeters || 650, 250), 1200);

  const cacheKey = `urban:${centerLat.toFixed(3)},${centerLng.toFixed(3)}:${radius}`;
  const cached = poiCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const around = `(around:${radius},${centerLat.toFixed(5)},${centerLng.toFixed(5)})`;
  const ql = `[out:json][timeout:8];(way["building"]${around};way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"]${around};);out geom 260;`;

  try {
    const json = await queryOverpass(ql);
    const elements = Array.isArray(json.elements) ? json.elements : [];

    const buildings: UrbanBuilding[] = [];
    const roads: UrbanRoad[] = [];

    for (const el of elements) {
      if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 2) {
        continue;
      }
      const tags: Record<string, string> = el.tags || {};
      const pts: Array<[number, number]> = el.geometry.map((g: any) => [
        Number(g.lat),
        Number(g.lon),
      ]);

      if (tags.building && pts.length >= 3 && buildings.length < 150) {
        const parsedHeight = tags.height
          ? Number.parseFloat(tags.height)
          : tags["building:levels"]
            ? Number.parseFloat(tags["building:levels"]) * 3.6
            : NaN;
        const heightMeters = Number.isFinite(parsedHeight)
          ? Math.min(Math.max(parsedHeight, 5), 140)
          : 10 + ((Number(el.id) % 9) * 3.2);

        buildings.push({
          id: `b_${el.id}`,
          footprint: pts.slice(0, 16),
          heightMeters,
          kind: tags.building,
        });
      } else if (tags.highway && roads.length < 120) {
        roads.push({
          id: `r_${el.id}`,
          points: pts,
          highway: tags.highway,
        });
      }
    }

    const result: UrbanContextData = {
      source: "OpenStreetMap Overpass API",
      fetchedAt: Date.now(),
      buildings,
      roads,
      isFallbackGrid: buildings.length === 0 && roads.length === 0,
    };

    poiCache.set(cacheKey, { expires: Date.now() + TTL_MS, data: result });
    return result;
  } catch {
    return {
      source: "OpenStreetMap Overpass (temporarily rate-limited — corridor geometry active)",
      fetchedAt: Date.now(),
      buildings: [],
      roads: [],
      isFallbackGrid: true,
    };
  }
}
