import type {
  DiscoveredPOI,
  UrbanBuilding,
  UrbanContextData,
  UrbanPointFeature,
  UrbanPolygonFeature,
  UrbanRoad,
  UrbanTerrainGrid,
} from "../../src/types/mobility";
import { haversineKm, searchNominatimBoundedPOIs } from "./geoService";

const OVERPASS_ENDPOINTS = Array.from(
  new Set([
    process.env.OVERPASS_BASE_URL || "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ]),
);

const USER_AGENT = "SmartRoutes/3.0 (OpenStreetMap Overpass Integration)";
const poiCache = new Map<string, { expires: number; data: any }>();
const TTL_MS = 5 * 60 * 1000;
let overpassCooldownUntil = 0;

async function queryOverpass(ql: string, timeoutMs = 5000): Promise<any> {
  if (Date.now() < overpassCooldownUntil) {
    throw new Error("Overpass mirrors temporarily in cooldown after timeout");
  }
  const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      body: new URLSearchParams({ data: ql }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Overpass HTTP ${res.status} (${endpoint})`);
    }
    const json = (await res.json()) as { elements?: any[] };
    if (!json || !Array.isArray(json.elements)) {
      throw new Error(`Invalid Overpass payload (${endpoint})`);
    }
    return json;
  });
  try {
    return await Promise.any(attempts);
  } catch (err) {
    overpassCooldownUntil = Date.now() + 90_000;
    throw err;
  }
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
      return [
        `nwr["highway"="rest_area"]${around};`,
        `nwr["highway"="services"]${around};`,
        `nwr["amenity"="cafe"]${around};`,
        `nwr["tourism"="motel"]${around};`,
        `nwr["tourism"="hotel"]${around};`,
      ].join("");
    case "food":
      return [
        `nwr["amenity"="restaurant"]${around};`,
        `nwr["amenity"="fast_food"]${around};`,
        `nwr["amenity"="cafe"]${around};`,
        `nwr["amenity"="food_court"]${around};`,
      ].join("");
    case "service":
      return [
        `nwr["shop"="car_repair"]${around};`,
        `nwr["shop"="tyres"]${around};`,
        `nwr["shop"="motorcycle_repair"]${around};`,
        `nwr["amenity"="car_wash"]${around};`,
        `nwr["craft"="car_repair"]${around};`,
      ].join("");
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
  const shop = tags.shop || "";
  const craft = tags.craft || "";
  const tourism = tags.tourism || "";

  if (requested === "rest") {
    if (
      tags.highway === "rest_area" ||
      tags.highway === "services" ||
      amenity === "cafe" ||
      tourism === "motel" ||
      tourism === "hotel"
    ) {
      return "rest";
    }
  }
  if (requested === "food") {
    if (
      amenity === "restaurant" ||
      amenity === "fast_food" ||
      amenity === "cafe" ||
      amenity === "food_court"
    ) {
      return "food";
    }
  }
  if (amenity === "hospital" || amenity === "clinic") return "hospital";
  if (amenity === "police") return "police";
  if (amenity === "fire_station") return "fire";
  if (amenity === "parking") return "parking";
  if (amenity === "fuel") return "fuel";
  if (amenity === "charging_station") return "charging";
  if (amenity === "restaurant" || amenity === "fast_food" || amenity === "food_court") return "food";
  if (
    amenity === "cafe" ||
    tags.highway === "rest_area" ||
    tags.highway === "services" ||
    tourism === "motel" ||
    tourism === "hotel"
  ) {
    return "rest";
  }
  if (
    shop === "car_repair" ||
    shop === "tyres" ||
    shop === "motorcycle_repair" ||
    craft === "car_repair" ||
    amenity === "car_wash"
  ) {
    return "service";
  }
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

function formatAddress(tags: Record<string, string>): { address: string; hasAddress: boolean } {
  if (tags["addr:full"] && tags["addr:full"].trim()) {
    return { address: tags["addr:full"].trim(), hasAddress: true };
  }

  const streetPart =
    tags["addr:housenumber"] && tags["addr:street"]
      ? `${tags["addr:housenumber"]} ${tags["addr:street"]}`
      : tags["addr:street"] || tags["addr:road"] || tags["addr:place"];

  const localityPart =
    tags["addr:neighbourhood"] ||
    tags["addr:suburb"] ||
    tags["addr:hamlet"] ||
    tags["addr:locality"];

  const cityPart =
    tags["addr:city"] ||
    tags["addr:town"] ||
    tags["addr:village"] ||
    tags["addr:district"];

  const statePart = tags["addr:state"];
  const postcodePart = tags["addr:postcode"];

  const rawParts = [streetPart, localityPart, cityPart, statePart, postcodePart]
    .map((p) => (p || "").trim())
    .filter(Boolean);

  // Deduplicate adjacent identical parts (case-insensitive)
  const uniqueParts: string[] = [];
  for (const part of rawParts) {
    if (!uniqueParts.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
      uniqueParts.push(part);
    }
  }

  if (uniqueParts.length > 0) {
    return { address: uniqueParts.join(", "), hasAddress: true };
  }

  return { address: "Not available", hasAddress: false };
}

function defaultLabelForCategory(category: DiscoveredPOI["category"], tags: Record<string, string>): string {
  if (category === "fuel") return "Fuel / Petrol Station";
  if (category === "parking") return "Parking Area";
  if (category === "charging") return "EV Charging Station";
  if (category === "rest") {
    if (tags.highway === "rest_area") return "Highway Rest Area";
    if (tags.highway === "services") return "Highway Services";
    if (tags.tourism === "motel" || tags.tourism === "hotel") return "Traveler Lodge / Hotel";
    return "Rest Stop / Cafe";
  }
  if (category === "food") return "Food / Restaurant";
  if (category === "service") {
    if (tags.amenity === "car_wash") return "Car Wash";
    if (tags.shop === "tyres") return "Tyre & Wheel Shop";
    return "Vehicle Repair Shop";
  }
  if (category === "hospital") return "Hospital / Clinic";
  if (category === "police") return "Police Station";
  if (category === "fire") return "Fire Station";
  return "OpenStreetMap Stop";
}

function getNominatimKeywords(category: string): string[] {
  switch (category) {
    case "parking":
      return ["[amenity=parking]"];
    case "fuel":
      return ["[amenity=fuel]"];
    case "charging":
      return ["[amenity=charging_station]"];
    case "rest":
      return ["[amenity=cafe]", "[tourism=hotel]"];
    case "food":
      return ["[amenity=restaurant]", "[amenity=fast_food]"];
    case "service":
      return ["[shop=car_repair]", "[shop=tyres]", "[amenity=car_wash]"];
    case "hospital":
      return ["[amenity=hospital]", "[amenity=clinic]"];
    case "police":
      return ["[amenity=police]"];
    case "emergency":
      return ["[amenity=hospital]", "[amenity=police]"];
    default:
      return ["[amenity=parking]"];
  }
}

export async function discoverPOIs(params: {
  lat: number;
  lng: number;
  category: string;
  radiusMeters?: number;
  limit?: number;
}): Promise<DiscoveredPOI[]> {
  const { lat, lng, category } = params;
  const radiusMeters = Math.min(Math.max(params.radiusMeters || 5000, 500), 25000);
  const radiusKm = radiusMeters / 1000;
  const limit = Math.min(Math.max(params.limit || 15, 1), 30);

  const cacheKey = `poi:${category}:${lat.toFixed(4)},${lng.toFixed(4)}:${radiusMeters}:${limit}`;
  const cached = poiCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const filter = buildOverpassFilter(category, lat, lng, radiusMeters);
  const ql = `[out:json][timeout:8];(${filter});out center 80;`;

  let overpassSucceeded = false;
  let overpassError: string | null = null;
  const results: DiscoveredPOI[] = [];
  const seenIds = new Set<string>();
  const seenLocations = new Set<string>();

  try {
    const json = await queryOverpass(ql);
    overpassSucceeded = true;
    const elements = Array.isArray(json.elements) ? json.elements : [];

    for (const el of elements) {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (typeof elLat !== "number" || typeof elLng !== "number") continue;

      const distanceKm = haversineKm(lat, lng, elLat, elLng);
      // Strict radius filter — never include elements outside configured radius
      if (distanceKm > radiusKm) continue;

      const tags: Record<string, string> = el.tags || {};
      const normCat = normalizeCategory(category, tags);
      const explicitName = (
        tags.name ||
        tags["name:en"] ||
        tags.brand ||
        tags.operator ||
        ""
      ).trim();

      const rawName = explicitName || defaultLabelForCategory(normCat, tags);
      const osmId = `osm_${el.type}_${el.id}`;
      if (seenIds.has(osmId)) continue;

      // Deduplicate same name at essentially identical coordinates (~40m)
      const locKey = `${rawName.toLowerCase()}:${elLat.toFixed(4)}:${elLng.toFixed(4)}`;
      if (seenLocations.has(locKey)) continue;

      seenIds.add(osmId);
      seenLocations.add(locKey);

      const capNum = tags.capacity ? Number.parseInt(tags.capacity, 10) : null;
      const addrInfo = formatAddress(tags);
      const phone =
        tags.phone ||
        tags["contact:phone"] ||
        tags["phone:mobile"] ||
        tags["contact:mobile"] ||
        undefined;
      const website = tags.website || tags["contact:website"] || undefined;

      results.push({
        id: osmId,
        name: rawName,
        category: normCat,
        lat: Number(elLat.toFixed(6)),
        lng: Number(elLng.toFixed(6)),
        address: addrInfo.address,
        hasAddress: addrInfo.hasAddress,
        distanceKm: Number(distanceKm.toFixed(2)),
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
        phone,
        website,
        brand: tags.brand || undefined,
        operator: tags.operator || undefined,
      });
    }

    // Prefer named places when distances are virtually identical, otherwise sort strictly by distance
    results.sort((a, b) => a.distanceKm - b.distanceKm);
    if (results.length > 0) {
      const trimmed = results.slice(0, limit);
      poiCache.set(cacheKey, { expires: Date.now() + TTL_MS, data: trimmed });
      return trimmed;
    }
  } catch (err: any) {
    overpassError = err?.message || "OpenStreetMap Overpass request failed";
  }

  // Fallback via OpenStreetMap Nominatim strictly bounded to the requested radius
  let nominatimSucceeded = false;
  let nominatimError: string | null = null;
  const keywords = getNominatimKeywords(category);
  const nomResults: DiscoveredPOI[] = [];

  const fallbackName = defaultLabelForCategory(normalizeCategory(category, {}), {});
  for (const kw of keywords) {
    if (nomResults.length >= limit) break;
    try {
      const rows = await searchNominatimBoundedPOIs(
        kw,
        { lat, lng },
        radiusKm,
        limit,
        fallbackName,
      );
      nominatimSucceeded = true;

      for (const row of rows) {
        if (row.distanceKm > radiusKm) continue;
        if (seenIds.has(row.id)) continue;
        const locKey = `${row.name.toLowerCase()}:${row.lat.toFixed(4)}:${row.lng.toFixed(4)}`;
        if (seenLocations.has(locKey)) continue;

        seenIds.add(row.id);
        seenLocations.add(locKey);

        nomResults.push({
          id: row.id,
          name: row.name,
          category: normalizeCategory(category, {}),
          lat: Number(row.lat.toFixed(6)),
          lng: Number(row.lng.toFixed(6)),
          address: row.address,
          hasAddress: row.hasAddress,
          distanceKm: row.distanceKm,
          accessibility: row.accessibility,
          openingHours: row.openingHours,
          capacity: row.capacity ?? null,
          availabilityStatus:
            category === "parking" || category === "charging"
              ? "Unknown (no live sensor feed)"
              : "Verify hours on arrival",
          source: "OpenStreetMap Nominatim",
          phone: row.phone,
          website: row.website,
          brand: row.brand,
          operator: row.operator,
        });
      }

      if (nomResults.length > 0) break;
    } catch (err: any) {
      nominatimError = err?.message || "OpenStreetMap Nominatim request failed";
    }
  }

  // If both OpenStreetMap Overpass and Nominatim failed, surface a real error (never silent fake/empty success)
  if (!overpassSucceeded && !nominatimSucceeded) {
    throw new Error(
      `OpenStreetMap location services are temporarily unavailable (${overpassError || nominatimError}). Please retry.`,
    );
  }

  nomResults.sort((a, b) => a.distanceKm - b.distanceKm);
  const finalTrimmed = nomResults.slice(0, limit);
  poiCache.set(cacheKey, { expires: Date.now() + TTL_MS, data: finalTrimmed });
  return finalTrimmed;
}

async function fetchOpenMeteoTerrainGrid(
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
): Promise<UrbanTerrainGrid | null> {
  const gridSize = 5;
  const halfExtentKm = Math.max(radiusMeters / 1000, 0.7);
  const dLat = halfExtentKm / 111.32;
  const cosLat = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.2);
  const dLng = halfExtentKm / (111.32 * cosLat);

  const minLat = centerLat - dLat;
  const maxLat = centerLat + dLat;
  const minLng = centerLng - dLng;
  const maxLng = centerLng + dLng;

  const lats: string[] = [];
  const lngs: string[] = [];
  for (let row = 0; row < gridSize; row++) {
    const tLat = row / (gridSize - 1);
    const lat = minLat + tLat * (maxLat - minLat);
    for (let col = 0; col < gridSize; col++) {
      const tLng = col / (gridSize - 1);
      const lng = minLng + tLng * (maxLng - minLng);
      lats.push(lat.toFixed(5));
      lngs.push(lng.toFixed(5));
    }
  }

  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lngs.join(",")}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { elevation?: number[] };
    if (!Array.isArray(json.elevation) || json.elevation.length !== gridSize * gridSize) {
      return null;
    }
    const elevations = json.elevation.map((v) => (Number.isFinite(v) ? Number(v) : 0));
    const minElevationM = Math.min(...elevations);
    const maxElevationM = Math.max(...elevations);
    const centerIdx = Math.floor((gridSize * gridSize) / 2);
    const baseElevationM = elevations[centerIdx] ?? minElevationM;

    return {
      available: true,
      source: "Open-Meteo Copernicus DEM (90m)",
      baseElevationM: Number(baseElevationM.toFixed(1)),
      minElevationM: Number(minElevationM.toFixed(1)),
      maxElevationM: Number(maxElevationM.toFixed(1)),
      gridSize,
      bounds: { minLat, maxLat, minLng, maxLng },
      elevations,
    };
  } catch {
    return null;
  }
}

function computePolygonCenter(pts: Array<[number, number]>): [number, number] {
  if (pts.length === 0) return [0, 0];
  let sumLat = 0;
  let sumLng = 0;
  for (const [lat, lng] of pts) {
    sumLat += lat;
    sumLng += lng;
  }
  return [sumLat / pts.length, sumLng / pts.length];
}

export async function fetchUrbanContext(params: {
  centerLat: number;
  centerLng: number;
  radiusMeters?: number;
}): Promise<UrbanContextData> {
  const { centerLat, centerLng } = params;
  const radius = Math.min(Math.max(params.radiusMeters || 750, 300), 1400);

  const cacheKey = `urban_v2:${centerLat.toFixed(3)},${centerLng.toFixed(3)}:${radius}`;
  const cached = poiCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  // Always fetch real elevation terrain from Open-Meteo in parallel
  const terrainPromise = fetchOpenMeteoTerrainGrid(centerLat, centerLng, radius);

  const around = `(around:${radius},${centerLat.toFixed(5)},${centerLng.toFixed(5)})`;
  const treeAround = `(around:${Math.min(radius, 500)},${centerLat.toFixed(5)},${centerLng.toFixed(5)})`;
  const ql = `[out:json][timeout:8];(
    way["building"]${around};
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"]${around};
    way["leisure"~"^(park|garden|pitch|recreation_ground)$"]${around};
    way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green)$"]${around};
    way["natural"="water"]${around};
    way["waterway"~"^(riverbank|river|canal)$"]${around};
    node["natural"="tree"]${treeAround};
    node["tourism"~"^(attraction|museum|viewpoint|monument|theme_park)$"]${around};
    node["historic"]${around};
    node["amenity"~"^(place_of_worship|university|college|hospital|bus_station|townhall)$"]${around};
    node["railway"~"^(station|halt)$"]${around};
  );out geom 380;`;

  const buildings: UrbanBuilding[] = [];
  const roads: UrbanRoad[] = [];
  const parks: UrbanPolygonFeature[] = [];
  const waterBodies: UrbanPolygonFeature[] = [];
  const trees: UrbanPointFeature[] = [];
  const landmarks: UrbanPointFeature[] = [];

  let overpassSucceeded = false;

  try {
    const json = await queryOverpass(ql, 8500);
    overpassSucceeded = true;
    const elements = Array.isArray(json.elements) ? json.elements : [];

    for (const el of elements) {
      const tags: Record<string, string> = el.tags || {};

      if (el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number") {
        if (tags.natural === "tree") {
          if (trees.length < 120) {
            trees.push({
              id: `tree_${el.id}`,
              name: tags.species || tags.name || undefined,
              category: "tree",
              lat: Number(el.lat),
              lng: Number(el.lon),
            });
          }
        } else if (landmarks.length < 40) {
          const lmName = (tags.name || tags["name:en"] || "").trim();
          const lmCat =
            tags.tourism ||
            tags.historic ||
            tags.amenity ||
            tags.railway ||
            "landmark";
          if (lmName) {
            const addr = formatAddress(tags);
            landmarks.push({
              id: `lm_${el.id}`,
              name: lmName,
              category: lmCat.replace(/_/g, " "),
              lat: Number(el.lat),
              lng: Number(el.lon),
              address: addr.hasAddress ? addr.address : undefined,
            });
          }
        }
        continue;
      }

      if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 2) {
        continue;
      }

      const pts: Array<[number, number]> = el.geometry.map((g: any) => [
        Number(g.lat),
        Number(g.lon),
      ]);

      if (tags.building && pts.length >= 3 && buildings.length < 160) {
        let heightMeters: number;
        let heightSource: UrbanBuilding["heightSource"];

        const rawHeight = tags.height ? Number.parseFloat(tags.height) : NaN;
        const rawLevels = tags["building:levels"]
          ? Number.parseFloat(tags["building:levels"])
          : NaN;

        if (Number.isFinite(rawHeight) && rawHeight > 0) {
          heightMeters = Math.min(Math.max(rawHeight, 4), 160);
          heightSource = "osm_height";
        } else if (Number.isFinite(rawLevels) && rawLevels > 0) {
          heightMeters = Math.min(Math.max(rawLevels * 3.5, 4), 160);
          heightSource = "osm_levels";
        } else {
          heightMeters = 9 + ((Number(el.id) % 7) * 2.8);
          heightSource = "footprint_default";
        }

        const [cLat, cLng] = computePolygonCenter(pts);
        const addr = formatAddress(tags);
        const bName = (tags.name || tags["name:en"] || tags.operator || "").trim() || undefined;

        buildings.push({
          id: `b_${el.id}`,
          name: bName,
          address: addr.hasAddress ? addr.address : undefined,
          footprint: pts.slice(0, 18),
          centerLat: Number(cLat.toFixed(6)),
          centerLng: Number(cLng.toFixed(6)),
          heightMeters: Number(heightMeters.toFixed(1)),
          heightSource,
          kind: tags.building !== "yes" ? tags.building : tags.amenity || tags.shop || "building",
        });
      } else if (tags.highway && roads.length < 140) {
        const layerNum = tags.layer ? Number.parseInt(tags.layer, 10) : 0;
        const lanesNum = tags.lanes ? Number.parseInt(tags.lanes, 10) : undefined;
        const isBridge =
          Boolean(tags.bridge && tags.bridge !== "no") ||
          (Number.isFinite(layerNum) && layerNum > 0);
        roads.push({
          id: `r_${el.id}`,
          name: (tags.name || tags.ref || "").trim() || undefined,
          points: pts,
          highway: tags.highway,
          isBridge,
          layer: Number.isFinite(layerNum) ? layerNum : 0,
          lanes: lanesNum && Number.isFinite(lanesNum) ? lanesNum : undefined,
        });
      } else if (
        (tags.leisure || tags.landuse) &&
        pts.length >= 3 &&
        parks.length < 35
      ) {
        const [cLat, cLng] = computePolygonCenter(pts);
        parks.push({
          id: `park_${el.id}`,
          name: (tags.name || tags["name:en"] || "").trim() || undefined,
          kind: tags.leisure || tags.landuse || "park",
          footprint: pts.slice(0, 20),
          centerLat: Number(cLat.toFixed(6)),
          centerLng: Number(cLng.toFixed(6)),
        });
      } else if (
        (tags.natural === "water" || tags.waterway) &&
        pts.length >= 3 &&
        waterBodies.length < 25
      ) {
        const [cLat, cLng] = computePolygonCenter(pts);
        waterBodies.push({
          id: `water_${el.id}`,
          name: (tags.name || tags["name:en"] || "").trim() || undefined,
          kind: tags.water || tags.waterway || "water",
          footprint: pts.slice(0, 22),
          centerLat: Number(cLat.toFixed(6)),
          centerLng: Number(cLng.toFixed(6)),
        });
      }
    }
  } catch {
    // Overpass temporarily unavailable/rate-limited; enrich with bounded Nominatim landmarks below
  }

  // If Overpass returned no landmarks/buildings (e.g., cooldown), fetch real bounded Nominatim landmarks near center
  let nominatimUsed = false;
  if (!overpassSucceeded || (buildings.length === 0 && landmarks.length === 0)) {
    const searchRadiusKm = Math.max(radius / 1000, 1.8);
    const queries = [
      { q: "[amenity=place_of_worship]", cat: "landmark" },
      { q: "[leisure=park]", cat: "park" },
      { q: "[amenity=hospital]", cat: "hospital" },
    ];
    for (const item of queries) {
      if (landmarks.length >= 16) break;
      try {
        const rows = await searchNominatimBoundedPOIs(
          item.q,
          { lat: centerLat, lng: centerLng },
          searchRadiusKm,
          6,
        );
        nominatimUsed = true;
        for (const r of rows) {
          if (landmarks.some((l) => l.id === `nom_lm_${r.id}`)) continue;
          landmarks.push({
            id: `nom_lm_${r.id}`,
            name: r.name,
            category: item.cat,
            lat: r.lat,
            lng: r.lng,
            address: r.hasAddress ? r.address : undefined,
          });
        }
      } catch {
        // continue with remaining queries
      }
    }
  }

  const terrain = await terrainPromise;

  const sources: string[] = [];
  if (overpassSucceeded && (buildings.length > 0 || roads.length > 0 || parks.length > 0)) {
    sources.push("OpenStreetMap Overpass");
  } else if (nominatimUsed && landmarks.length > 0) {
    sources.push("OpenStreetMap Nominatim Landmarks");
  }
  if (terrain?.available) {
    sources.push("Open-Meteo Elevation");
  }

  const result: UrbanContextData = {
    source:
      sources.length > 0
        ? sources.join(" + ")
        : "OSRM Route Corridor (OpenStreetMap Overpass temporarily rate-limited)",
    fetchedAt: Date.now(),
    centerLat,
    centerLng,
    buildings,
    roads,
    parks,
    waterBodies,
    trees,
    landmarks,
    terrain,
    isFallbackGrid: !overpassSucceeded && buildings.length === 0 && roads.length === 0,
  };

  poiCache.set(cacheKey, { expires: Date.now() + TTL_MS, data: result });
  return result;
}
