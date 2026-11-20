import type { LiveTrafficIncident, LiveTrafficSnapshot } from "../../src/types/mobility";

const trafficCache = new Map<string, { expires: number; data: LiveTrafficSnapshot }>();
const TTL_MS = 2 * 60 * 1000;

function mapCongestionLevel(
  currentSpeed: number,
  freeFlowSpeed: number,
): "free" | "moderate" | "heavy" | "severe" {
  if (freeFlowSpeed <= 0) return "free";
  const ratio = currentSpeed / freeFlowSpeed;
  if (ratio >= 0.8) return "free";
  if (ratio >= 0.55) return "moderate";
  if (ratio >= 0.3) return "heavy";
  return "severe";
}

function mapTomTomIncidentCategory(iconCategory: unknown): string {
  switch (Number(iconCategory)) {
    case 1:
      return "Accident";
    case 2:
      return "Fog";
    case 3:
      return "Dangerous Conditions";
    case 4:
      return "Rain";
    case 5:
      return "Ice";
    case 6:
      return "Traffic Jam";
    case 7:
      return "Lane Closed";
    case 8:
      return "Road Closed";
    case 9:
      return "Roadworks";
    case 10:
      return "Wind";
    case 11:
      return "Flooding";
    case 14:
      return "Broken Down Vehicle";
    default:
      return "Traffic Incident";
  }
}

export async function getLiveTrafficContext(
  lat: number,
  lng: number,
): Promise<LiveTrafficSnapshot> {
  const apiKey = (process.env.TOMTOM_API_KEY || "").trim();
  if (!apiKey) {
    return {
      available: false,
      provider: "Unavailable (no live traffic API key configured)",
      fetchedAt: Date.now(),
      location: { lat, lng },
      flow: null,
      incidents: [],
      reason:
        "No commercial live traffic feed (TOMTOM_API_KEY) is configured on the server. Route ETAs use OpenStreetMap OSRM road-graph speeds combined with community road reports.",
    };
  }

  const cacheKey = `traffic:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = trafficCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    const flowUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat.toFixed(5)},${lng.toFixed(5)}&unit=KMPH&key=${encodeURIComponent(apiKey)}`;
    const flowRes = await fetch(flowUrl, {
      signal: AbortSignal.timeout(6500),
    });

    if (!flowRes.ok) {
      throw new Error(`TomTom Traffic Flow HTTP ${flowRes.status}`);
    }

    const flowJson = (await flowRes.json()) as {
      flowSegmentData?: {
        currentSpeed?: number;
        freeFlowSpeed?: number;
        confidence?: number;
      };
    };

    const seg = flowJson.flowSegmentData;
    const flow =
      seg && typeof seg.currentSpeed === "number" && typeof seg.freeFlowSpeed === "number"
        ? {
            currentSpeedKmh: Math.round(seg.currentSpeed),
            freeFlowSpeedKmh: Math.round(seg.freeFlowSpeed),
            congestionLevel: mapCongestionLevel(seg.currentSpeed, seg.freeFlowSpeed),
            confidence: Number((seg.confidence ?? 0.8).toFixed(2)),
          }
        : null;

    // Also fetch nearby verified TomTom traffic incidents within ~6 km bbox
    const incidents: LiveTrafficIncident[] = [];
    try {
      const d = 0.055;
      const bbox = `${(lng - d).toFixed(5)},${(lat - d).toFixed(5)},${(lng + d).toFixed(5)},${(lat + d).toFixed(5)}`;
      const incUrl = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}&fields=%7Bincidents%7Btype,geometry%7Btype,coordinates%7D,properties%7Bid,iconCategory,magnitudeOfDelay,events%7Bdescription%7D,delay%7D%7D%7D&language=en-GB&key=${encodeURIComponent(apiKey)}`;
      const incRes = await fetch(incUrl, { signal: AbortSignal.timeout(6500) });
      if (incRes.ok) {
        const incJson = (await incRes.json()) as { incidents?: any[] };
        for (const item of (incJson.incidents || []).slice(0, 12)) {
          const coords = item?.geometry?.coordinates;
          const pt = Array.isArray(coords?.[0]) ? coords[0] : coords;
          if (!Array.isArray(pt) || pt.length < 2) continue;
          const mag = Number(item?.properties?.magnitudeOfDelay ?? 1);
          const severity: "low" | "moderate" | "high" =
            mag >= 3 ? "high" : mag === 2 ? "moderate" : "low";
          const desc =
            item?.properties?.events?.[0]?.description ||
            "Verified traffic incident";
          incidents.push({
            id: String(item?.properties?.id || `tt_${incidents.length}`),
            category: mapTomTomIncidentCategory(item?.properties?.iconCategory),
            description: desc,
            severity,
            lat: Number(pt[1]),
            lng: Number(pt[0]),
            delayMinutes:
              typeof item?.properties?.delay === "number"
                ? Math.round(item.properties.delay / 60)
                : undefined,
          });
        }
      }
    } catch {
      // Flow succeeded even if incidents lookup failed
    }

    const snapshot: LiveTrafficSnapshot = {
      available: Boolean(flow || incidents.length > 0),
      provider: "TomTom Live Traffic API",
      fetchedAt: Date.now(),
      location: { lat, lng },
      flow,
      incidents,
    };
    trafficCache.set(cacheKey, { expires: Date.now() + TTL_MS, data: snapshot });
    return snapshot;
  } catch (err: any) {
    return {
      available: false,
      provider: "TomTom Traffic API (temporarily unavailable)",
      fetchedAt: Date.now(),
      location: { lat, lng },
      flow: null,
      incidents: [],
      reason: err?.message || "Could not reach live traffic service.",
    };
  }
}
