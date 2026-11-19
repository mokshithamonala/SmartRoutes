import {
  GoogleGenAI,
  Type,
  type FunctionDeclaration,
  type Content,
} from "@google/genai";
import type {
  AgentToolTrace,
  CommunityReport,
  CompanionMapAction,
  CompanionResponse,
  PredictiveRouteResult,
  UserPreferencesRecord,
} from "../../src/types/mobility";
import {
  calculatePredictiveRoute,
  haversineKm,
  searchLocations,
} from "./geoService";
import { discoverPOIs } from "./poiAndUrbanService";
import { getWeatherContext } from "./weatherService";

const MODEL_NAME = "gemini-4-hydrogen";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Six specialized modular agent capabilities exposed as Gemini Function Declarations
const AGENT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "plan_journey",
    description:
      "Journey Planning Agent: Geocode an origin and destination using OpenStreetMap Nominatim and calculate real driving routes with OSRM.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        originQuery: {
          type: Type.STRING,
          description: "Origin address or place name (omit if using active route origin).",
        },
        destinationQuery: {
          type: Type.STRING,
          description: "Destination address or place name.",
        },
        routeType: {
          type: Type.STRING,
          description: "Preferred optimization mode: fastest, shortest, or balanced.",
        },
      },
      required: ["destinationQuery"],
    },
  },
  {
    name: "analyze_active_route",
    description:
      "Route Intelligence Agent: Compare alternative routes on the currently active journey by distance, OSRM estimated duration, turn count, sharp turns, and quality score.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        focus: {
          type: Type.STRING,
          description: "Comparison focus: fastest, shortest, fewer_turns, or overall.",
        },
      },
      required: ["focus"],
    },
  },
  {
    name: "check_route_safety",
    description:
      "Driver Safety Agent: Retrieve community-reported road hazards along the active route corridor and check real weather/visibility conditions via Open-Meteo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        corridorRadiusKm: {
          type: Type.NUMBER,
          description: "Search radius in km around route points for community reports (default 3).",
        },
      },
    },
  },
  {
    name: "discover_stops",
    description:
      "Parking & Stop Discovery Agent: Find real parking, EV charging, fuel stations, rest stops, food stops, or auto services near the destination or route midpoint using OpenStreetMap.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description: "One of: parking, fuel, charging, rest, food, service.",
        },
        near: {
          type: Type.STRING,
          description: "Where to search: destination, midpoint, origin, or a place name.",
        },
      },
      required: ["category"],
    },
  },
  {
    name: "find_emergency_services",
    description:
      "Emergency Assistance Agent: Discover nearest real hospitals, police stations, or emergency services via OpenStreetMap and calculate an OSRM route to the nearest facility.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        serviceType: {
          type: Type.STRING,
          description: "One of: hospital, police, emergency.",
        },
      },
      required: ["serviceType"],
    },
  },
  {
    name: "generate_journey_briefing",
    description:
      "Journey Summary Agent: Compile a structured pre-drive preparation briefing combining active route metrics, turn complexity, weather, community reports, and user preferences.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        includeWeather: {
          type: Type.BOOLEAN,
          description: "Whether to include Open-Meteo weather context.",
        },
      },
    },
  },
];

export interface CompanionContextInput {
  activeRoute?: PredictiveRouteResult | null;
  selectedRouteId?: string | null;
  communityReports?: CommunityReport[];
  preferences?: Partial<UserPreferencesRecord> | null;
  userLocation?: { lat: number; lng: number } | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

const TOOL_AGENT_MAP: Record<string, AgentToolTrace["agent"]> = {
  plan_journey: "Journey Planning Agent",
  analyze_active_route: "Route Intelligence Agent",
  check_route_safety: "Driver Safety Agent",
  discover_stops: "Parking & Stop Discovery Agent",
  find_emergency_services: "Emergency Assistance Agent",
  generate_journey_briefing: "Journey Summary Agent",
};

async function executeAgentTool(
  toolName: string,
  args: Record<string, any>,
  ctx: CompanionContextInput,
  mapActions: CompanionMapAction[],
): Promise<{ result: any; summary: string }> {
  const activeRoute = ctx.activeRoute || null;
  const activeAlt =
    activeRoute?.alternatives.find((a) => a.routeId === ctx.selectedRouteId) ||
    activeRoute?.alternatives.find((a) => a.isRecommended) ||
    activeRoute?.alternatives[0] ||
    null;

  const anchorPoint =
    activeRoute?.destination ||
    ctx.userLocation || { lat: 40.758, lng: -73.9855, address: "Midtown Manhattan" };

  if (toolName === "plan_journey") {
    const destMatches = await searchLocations(String(args.destinationQuery || ""), 3);
    if (destMatches.length === 0) {
      return {
        result: { error: `Could not locate "${args.destinationQuery}" on OpenStreetMap.` },
        summary: `No geocoding match for "${args.destinationQuery}"`,
      };
    }
    const destination = destMatches[0];
    let origin = activeRoute?.origin || null;
    if (args.originQuery) {
      const origMatches = await searchLocations(String(args.originQuery), 3);
      if (origMatches.length > 0) origin = origMatches[0];
    }
    if (!origin && ctx.userLocation) {
      origin = {
        lat: ctx.userLocation.lat,
        lng: ctx.userLocation.lng,
        address: "Current Location",
      };
    }
    if (!origin) {
      return {
        result: {
          needsOrigin: true,
          resolvedDestination: destination,
          message:
            "Destination found, but no starting location is set yet. Ask the driver for an origin or use their current location.",
        },
        summary: `Resolved destination ${destination.label}; awaiting origin`,
      };
    }

    const routeType =
      args.routeType === "shortest" || args.routeType === "balanced"
        ? args.routeType
        : ctx.preferences?.preferredRouteType || "fastest";

    const routeResult = await calculatePredictiveRoute({
      origin,
      destination,
      preferences: {
        routeType,
        avoidTolls: ctx.preferences?.avoidTolls,
        avoidHighways: ctx.preferences?.avoidHighways,
      },
    });

    mapActions.push({
      type: "apply_route",
      label: `Load route to ${destination.label || destination.address.split(",")[0]}`,
      routeResult,
    });

    return {
      result: {
        origin: routeResult.origin.address,
        destination: routeResult.destination.address,
        provider: routeResult.provider,
        alternatives: routeResult.alternatives.map((a) => ({
          routeId: a.routeId,
          label: a.label,
          distanceKm: a.distanceKm,
          durationMin: a.durationMin,
          maneuverCount: a.turns.maneuverCount,
          sharpTurns: a.turns.sharpTurns,
          complexityLabel: a.turns.complexityLabel,
          qualityScore: a.qualityScore,
          isRecommended: a.isRecommended,
          tags: a.tags,
        })),
        disclaimer:
          "Travel times are OSRM road-network estimates without live traffic telemetry.",
      },
      summary: `Calculated ${routeResult.alternatives.length} OSRM route(s) (${routeResult.alternatives[0].distanceKm} km, ~${routeResult.alternatives[0].durationMin} min)`,
    };
  }

  if (toolName === "analyze_active_route") {
    if (!activeRoute) {
      return {
        result: {
          hasActiveRoute: false,
          message: "No active route is currently planned on the map.",
        },
        summary: "No active route to analyze",
      };
    }
    return {
      result: {
        hasActiveRoute: true,
        focus: args.focus || "overall",
        origin: activeRoute.origin.address,
        destination: activeRoute.destination.address,
        waypointsCount: activeRoute.waypoints.length,
        selectedRouteId: activeAlt?.routeId,
        confidence: activeRoute.predictionConfidence,
        alternatives: activeRoute.alternatives.map((a) => ({
          routeId: a.routeId,
          label: a.label,
          distanceKm: a.distanceKm,
          durationMin: a.durationMin,
          estimatedAvgSpeedKmh: a.estimatedAvgSpeedKmh,
          maneuvers: a.turns.maneuverCount,
          sharpTurns: a.turns.sharpTurns,
          roundabouts: a.turns.roundabouts,
          complexityScore: a.turns.complexityScore,
          complexityLabel: a.turns.complexityLabel,
          qualityScore: a.qualityScore,
          tags: a.tags,
          explanation: a.explanation,
          roads: a.turns.roadSummary,
        })),
        note: "Durations are OSRM estimated times, not verified live traffic times.",
      },
      summary: `Analyzed ${activeRoute.alternatives.length} route option(s) (focus: ${args.focus || "overall"})`,
    };
  }

  if (toolName === "check_route_safety") {
    const radiusKm = Number(args.corridorRadiusKm) || 3;
    const reports = ctx.communityReports || [];
    const activeOnly = reports.filter(
      (r) => r.verificationStatus !== "resolved" && r.expiresAt > Date.now(),
    );

    const routeCoords = activeAlt?.geometry || [];
    const matchedReports =
      routeCoords.length > 0
        ? activeOnly.filter((rep) => {
            const stride = Math.max(1, Math.floor(routeCoords.length / 25));
            for (let i = 0; i < routeCoords.length; i += stride) {
              const [lat, lng] = routeCoords[i];
              if (haversineKm(lat, lng, rep.lat, rep.lng) <= radiusKm) {
                return true;
              }
            }
            return false;
          })
        : activeOnly.slice(0, 6);

    const weatherPoint = activeRoute?.destination || anchorPoint;
    const weather = await getWeatherContext(weatherPoint.lat, weatherPoint.lng);

    return {
      result: {
        corridorRadiusKm: radiusKm,
        communityReportsCount: matchedReports.length,
        communityReports: matchedReports.map((r) => ({
          type: r.type,
          severity: r.severity,
          address: r.address,
          description: r.description,
          verificationStatus: r.verificationStatus,
          confirmations: r.confirmations,
          dataSource: "community_submitted",
        })),
        weather: weather.available
          ? {
              provider: weather.provider,
              condition: weather.conditionLabel,
              temperatureC: weather.temperatureC,
              precipitationMm: weather.precipitationMm,
              windSpeedKmh: weather.windSpeedKmh,
              severeWarning: weather.severeWarning,
              airQuality: weather.airQuality,
            }
          : { available: false, error: weather.error },
      },
      summary: `Found ${matchedReports.length} community report(s) and ${weather.available ? weather.conditionLabel : "weather unavailable"}`,
    };
  }

  if (toolName === "discover_stops") {
    const category = String(args.category || "parking");
    let searchCenter = { lat: anchorPoint.lat, lng: anchorPoint.lng };
    const nearArg = String(args.near || "destination").toLowerCase();

    if (nearArg === "origin" && activeRoute?.origin) {
      searchCenter = activeRoute.origin;
    } else if (nearArg === "midpoint" && activeAlt && activeAlt.geometry.length > 2) {
      const mid = activeAlt.geometry[Math.floor(activeAlt.geometry.length / 2)];
      searchCenter = { lat: mid[0], lng: mid[1] };
    } else if (
      nearArg !== "destination" &&
      nearArg !== "origin" &&
      nearArg !== "midpoint" &&
      nearArg.length > 2
    ) {
      const locs = await searchLocations(nearArg, 1);
      if (locs.length > 0) searchCenter = locs[0];
    }

    const pois = await discoverPOIs({
      lat: searchCenter.lat,
      lng: searchCenter.lng,
      category,
      radiusMeters: 4000,
      limit: 6,
    });

    if (pois.length > 0) {
      mapActions.push({
        type: "highlight_pois",
        label: `Show ${pois.length} ${category} locations on map`,
        pois,
      });
      mapActions.push({
        type: "add_stop",
        label: `Add "${pois[0].name}" as route stop`,
        poi: pois[0],
      });
    }

    return {
      result: {
        category,
        count: pois.length,
        stops: pois.map((p) => ({
          name: p.name,
          address: p.address,
          distanceKm: p.distanceKm,
          availabilityStatus: p.availabilityStatus,
          accessibility: p.accessibility,
          openingHours: p.openingHours,
          source: p.source,
        })),
        honestyNote:
          "Occupancy/availability is unknown because OpenStreetMap does not provide live parking sensors.",
      },
      summary: `Discovered ${pois.length} real ${category} stop(s) via OpenStreetMap`,
    };
  }

  if (toolName === "find_emergency_services") {
    const serviceType = String(args.serviceType || "hospital");
    const originPoint =
      ctx.userLocation ||
      activeRoute?.origin ||
      activeRoute?.destination || {
        lat: 40.758,
        lng: -73.9855,
        address: "Current Area",
      };

    const services = await discoverPOIs({
      lat: originPoint.lat,
      lng: originPoint.lng,
      category: serviceType,
      radiusMeters: 8000,
      limit: 5,
    });

    let emergencyRoute: PredictiveRouteResult | null = null;
    if (services.length > 0) {
      try {
        emergencyRoute = await calculatePredictiveRoute({
          origin: {
            lat: originPoint.lat,
            lng: originPoint.lng,
            address: "address" in originPoint ? originPoint.address : "Current Location",
          },
          destination: {
            lat: services[0].lat,
            lng: services[0].lng,
            address: `${services[0].name}, ${services[0].address}`,
            label: services[0].name,
          },
          isEmergency: true,
        });
        mapActions.push({
          type: "apply_emergency_route",
          label: `Navigate to ${services[0].name}`,
          routeResult: emergencyRoute,
          pois: services,
        });
      } catch {
        // Still return discovered emergency facilities
      }
    }

    return {
      result: {
        serviceType,
        count: services.length,
        facilities: services.map((s) => ({
          name: s.name,
          address: s.address,
          distanceKm: s.distanceKm,
          phone: s.phone,
          source: s.source,
        })),
        nearestRoute: emergencyRoute?.alternatives[0]
          ? {
              destination: services[0].name,
              distanceKm: emergencyRoute.alternatives[0].distanceKm,
              durationMin: emergencyRoute.alternatives[0].durationMin,
            }
          : null,
        safetyDisclaimer:
          "Decision-support routing only. SmartRoutes cannot dispatch emergency services or control traffic signals. In life-threatening emergencies, call local emergency services immediately.",
      },
      summary: `Found ${services.length} nearby ${serviceType} facility(s)`,
    };
  }

  if (toolName === "generate_journey_briefing") {
    const weatherPoint = activeRoute?.destination || anchorPoint;
    const weather =
      args.includeWeather !== false
        ? await getWeatherContext(weatherPoint.lat, weatherPoint.lng)
        : null;
    const activeReports = (ctx.communityReports || []).filter(
      (r) => r.verificationStatus !== "resolved" && r.expiresAt > Date.now(),
    );

    return {
      result: {
        hasActiveRoute: Boolean(activeRoute),
        routeSummary: activeAlt
          ? {
              origin: activeRoute?.origin.address,
              destination: activeRoute?.destination.address,
              stops: activeRoute?.waypoints.map((w) => w.label || w.address),
              distanceKm: activeAlt.distanceKm,
              estimatedDurationMin: activeAlt.durationMin,
              turnComplexity: activeAlt.turns.complexityLabel,
              maneuverCount: activeAlt.turns.maneuverCount,
              sharpTurns: activeAlt.turns.sharpTurns,
              qualityScore: activeAlt.qualityScore,
              disclaimer: activeAlt.timingDisclaimer,
            }
          : null,
        weather: weather?.available
          ? {
              condition: weather.conditionLabel,
              temperatureC: weather.temperatureC,
              precipitationMm: weather.precipitationMm,
              windSpeedKmh: weather.windSpeedKmh,
              severeWarning: weather.severeWarning,
              airQuality: weather.airQuality,
            }
          : { available: false },
        activeCommunityReportsCount: activeReports.length,
        userPreferences: ctx.preferences || null,
      },
      summary: "Compiled journey briefing from active route, weather, reports, and preferences",
    };
  }

  return {
    result: { error: `Unknown tool: ${toolName}` },
    summary: `Unknown tool ${toolName}`,
  };
}

export async function runMultiAgentCompanion(params: {
  message: string;
  context: CompanionContextInput;
}): Promise<CompanionResponse> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      reply: "",
      agentsUsed: [],
      toolTraces: [],
      mapActions: [],
      error:
        "GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets (or server environment) to enable the Gemini AI Driving Companion.",
    };
  }

  const systemInstruction = `You are the SmartRoutes AI Driving Companion — a multi-agent mobility intelligence assistant backed by real OpenStreetMap, OSRM, Open-Meteo, and user-saved application tools.

STRICT GROUNDING & SAFETY RULES:
1. Whenever the driver asks to plan a route, compare alternatives, find parking/stops, check weather/safety, locate emergency services, or prepare a journey briefing, call the appropriate tool(s) first before answering. For simple greetings or capability questions, answer directly without unnecessary tool calls.
2. NEVER invent or fabricate parking availability, live traffic congestion, road incidents, weather, or geographic places. If parking occupancy is unknown, explicitly say availability is unknown because no live sensor feed is connected.
3. Always distinguish OSRM estimated travel time from verified live traffic.
4. For emergency requests, clearly remind the driver that SmartRoutes is decision-support only and cannot dispatch emergency services or control traffic signals.
5. Safe-driving guidance: keep answers concise, scannable, and advise reviewing routes while parked rather than interacting with the screen while driving.
6. Format responses cleanly in plain readable prose with short bullet points where helpful.`;

  const contextPreamble = `Current workspace snapshot:
- Active route: ${
    params.context.activeRoute
      ? `${params.context.activeRoute.origin.address} -> ${params.context.activeRoute.destination.address} (${params.context.activeRoute.alternatives.length} option(s), ${params.context.activeRoute.waypoints.length} stop(s))`
      : "None currently loaded"
  }
- Active community reports in workspace: ${(params.context.communityReports || []).length}
- Driver preferences: ${params.context.preferences ? JSON.stringify(params.context.preferences) : "Default"}`;

  const contents: Content[] = [];
  const recentHistory = (params.context.history || []).slice(-6);
  for (const h of recentHistory) {
    contents.push({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    });
  }
  contents.push({
    role: "user",
    parts: [{ text: `${contextPreamble}\n\nDriver request: ${params.message}` }],
  });

  const toolTraces: AgentToolTrace[] = [];
  const mapActions: CompanionMapAction[] = [];
  const agentsUsed = new Set<string>();
  let activeModel = MODEL_NAME;

  const callModel = async () => {
    const modelsToTry = [activeModel, "gemini-3.1-flash-lite"].filter(
      (m, i, arr) => arr.indexOf(m) === i,
    );
    let lastErr: any;
    for (const model of modelsToTry) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: AGENT_TOOL_DECLARATIONS }],
            abortSignal: AbortSignal.timeout(22000),
          },
        });
        activeModel = model;
        return res;
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || "");
        const isTransient =
          err?.status === 503 ||
          msg.includes("503") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("high demand");
        if (!isTransient) {
          throw err;
        }
      }
    }
    throw lastErr;
  };

  try {
    let response = await callModel();

    // Execute up to 3 tool-calling rounds
    for (let round = 0; round < 3; round++) {
      const calls = response.functionCalls;
      if (!calls || calls.length === 0) break;

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) {
        contents.push(modelContent);
      }

      const functionResponseParts: any[] = [];
      for (const call of calls) {
        const name = call.name || "unknown";
        const agent = TOOL_AGENT_MAP[name] || "Journey Planning Agent";
        agentsUsed.add(agent);

        try {
          const { result, summary } = await executeAgentTool(
            name,
            (call.args as Record<string, any>) || {},
            params.context,
            mapActions,
          );
          toolTraces.push({ agent, toolName: name, status: "success", summary });
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name,
              response: { result },
            },
          });
        } catch (toolErr: any) {
          const errMsg = toolErr?.message || "Tool execution failed";
          toolTraces.push({ agent, toolName: name, status: "error", summary: errMsg });
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name,
              response: { error: errMsg },
            },
          });
        }
      }

      contents.push({
        role: "user",
        parts: functionResponseParts,
      });

      response = await callModel();
    }

    const finalText = (response.text || "").trim();
    return {
      reply:
        finalText ||
        "I ran the requested mobility tools, but could not generate a summary. Please review the updated results on the map.",
      agentsUsed: Array.from(agentsUsed),
      toolTraces,
      mapActions,
      modelUsed: activeModel,
    };
  } catch (err: any) {
    let readableMsg = err?.message || "Gemini API request failed";
    try {
      const parsed = JSON.parse(readableMsg);
      if (parsed?.error?.message) readableMsg = parsed.error.message;
    } catch {
      // keep raw message
    }
    return {
      reply: "",
      agentsUsed: Array.from(agentsUsed),
      toolTraces,
      mapActions,
      error: `AI Companion error: ${readableMsg}`,
    };
  }
}
