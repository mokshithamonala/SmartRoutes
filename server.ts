import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import {
  calculatePredictiveRoute,
  resolveOsrmBaseUrl,
  reverseGeocode,
  searchLocations,
} from "./server/services/geoService";
import {
  discoverPOIs,
  fetchUrbanContext,
} from "./server/services/poiAndUrbanService";
import { getWeatherContext } from "./server/services/weatherService";
import { getLiveTrafficContext } from "./server/services/trafficService";
import { runMultiAgentCompanion } from "./server/services/geminiAgentService";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local first (if present), then .env (without overriding existing process.env secrets)
const envLocalPath = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: false });
}
dotenv.config({ override: false });

function parseCliArgs(argv: string[]): { port: number; host: string } {
  let port = Number(process.env.PORT || 3000);
  let host = process.env.HOST || "0.0.0.0";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) port = parsed;
      i++;
    } else if (arg.startsWith("--port=")) {
      const parsed = Number(arg.slice("--port=".length));
      if (Number.isFinite(parsed) && parsed > 0) port = parsed;
    } else if (arg === "--host" && argv[i + 1]) {
      host = argv[i + 1];
      i++;
    } else if (arg.startsWith("--host=")) {
      host = arg.slice("--host=".length);
    }
  }

  return { port, host };
}

const { port: PORT, host: HOST } = parseCliArgs(process.argv.slice(2));
const IS_PROD = process.env.NODE_ENV === "production";

process.on("unhandledRejection", (reason) => {
  console.error("[SmartRoutes] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[SmartRoutes] Uncaught exception:", err);
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  // Health & capability status (never exposes secrets)
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      liveTrafficConfigured: Boolean(process.env.TOMTOM_API_KEY?.trim()),
      osrmBaseUrl: resolveOsrmBaseUrl(),
      nominatimBaseUrl:
        process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org",
      timestamp: Date.now(),
    });
  });

  // OpenStreetMap Nominatim location search
  app.get("/api/geo/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) {
        return res.json({ results: [] });
      }
      const limit = Number(req.query.limit || 6);
      const lat = req.query.lat ? Number(req.query.lat) : undefined;
      const lng = req.query.lng ? Number(req.query.lng) : undefined;
      const near =
        lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng }
          : undefined;
      const results = await searchLocations(q, limit, near);
      return res.json({ results, attribution: "© OpenStreetMap contributors (Nominatim)" });
    } catch (err: any) {
      return res.status(502).json({
        error: err?.message || "Location search failed",
        results: [],
      });
    }
  });

  // Reverse geocoding
  app.get("/api/geo/reverse", async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "Valid lat and lng are required" });
      }
      const point = await reverseGeocode(lat, lng);
      return res.json({ point });
    } catch (err: any) {
      return res.status(502).json({ error: err?.message || "Reverse geocode failed" });
    }
  });

  // OSRM Predictive Route Calculation (single & multi-stop)
  app.post("/api/routing/calculate", async (req, res) => {
    try {
      const { origin, destination, waypoints, preferences, isEmergency } = req.body || {};
      if (
        !origin ||
        !destination ||
        !Number.isFinite(origin.lat) ||
        !Number.isFinite(origin.lng) ||
        !Number.isFinite(destination.lat) ||
        !Number.isFinite(destination.lng)
      ) {
        return res
          .status(400)
          .json({ error: "Valid origin and destination coordinates are required." });
      }

      const result = await calculatePredictiveRoute({
        origin,
        destination,
        waypoints: Array.isArray(waypoints) ? waypoints : [],
        preferences,
        isEmergency: Boolean(isEmergency),
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(502).json({
        error: err?.message || "Route calculation failed",
      });
    }
  });

  // OpenStreetMap Overpass POI & Emergency Service Discovery
  app.get("/api/poi/search", async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const category = String(req.query.category || "parking");
      const rawRadius = req.query.radius ? Number(req.query.radius) : 5000;
      const radiusMeters = Number.isFinite(rawRadius)
        ? Math.min(Math.max(rawRadius, 500), 25000)
        : 5000;
      const rawLimit = req.query.limit ? Number(req.query.limit) : 15;
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 30)
        : 15;

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return res
          .status(400)
          .json({ error: "Valid latitude (-90..90) and longitude (-180..180) are required." });
      }

      const pois = await discoverPOIs({ lat, lng, category, radiusMeters, limit });
      return res.json({
        pois,
        reference: { lat, lng },
        radiusMeters,
        category,
        attribution: "© OpenStreetMap contributors",
        fetchedAt: Date.now(),
      });
    } catch (err: any) {
      return res.status(502).json({
        error: err?.message || "OpenStreetMap stop discovery failed",
        pois: [],
      });
    }
  });

  // Real 3D Urban Context (OSM Building Footprints + Surrounding Roads)
  app.get("/api/geo/urban-context", async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const radius = req.query.radius ? Number(req.query.radius) : 650;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "Valid lat and lng are required." });
      }
      const context = await fetchUrbanContext({
        centerLat: lat,
        centerLng: lng,
        radiusMeters: radius,
      });
      return res.json(context);
    } catch (err: any) {
      return res.status(502).json({
        source: "Unavailable",
        fetchedAt: Date.now(),
        centerLat: Number(req.query.lat) || 0,
        centerLng: Number(req.query.lng) || 0,
        error: err?.message || "Urban context unavailable",
        buildings: [],
        roads: [],
        parks: [],
        waterBodies: [],
        trees: [],
        landmarks: [],
        terrain: null,
        isFallbackGrid: true,
      });
    }
  });

  // Verified Live Traffic Provider (TomTom when TOMTOM_API_KEY is configured; transparent otherwise)
  app.get("/api/traffic", async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "Valid lat and lng are required." });
      }
      const traffic = await getLiveTrafficContext(lat, lng);
      return res.json(traffic);
    } catch (err: any) {
      return res.status(502).json({
        available: false,
        provider: "TomTom Live Traffic API",
        fetchedAt: Date.now(),
        location: { lat: Number(req.query.lat) || 0, lng: Number(req.query.lng) || 0 },
        flow: null,
        incidents: [],
        reason: err?.message || "Live traffic service unavailable",
      });
    }
  });

  // Modular Weather & Air Quality Provider (Open-Meteo)
  app.get("/api/weather", async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "Valid lat and lng are required." });
      }
      const weather = await getWeatherContext(lat, lng);
      return res.json(weather);
    } catch (err: any) {
      return res.status(502).json({
        available: false,
        provider: "Open-Meteo",
        timestamp: Date.now(),
        error: err?.message || "Weather service unavailable",
      });
    }
  });

  // Multi-Agent Gemini AI Driving Companion (server-side only)
  app.post("/api/ai/companion", async (req, res) => {
    try {
      const { message, context } = req.body || {};
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required." });
      }
      const response = await runMultiAgentCompanion({
        message: message.trim(),
        context: context || {},
      });
      if (response.error && !response.reply) {
        return res.status(503).json(response);
      }
      return res.json(response);
    } catch (err: any) {
      return res.status(500).json({
        reply: "",
        agentsUsed: [],
        toolTraces: [],
        mapActions: [],
        error: err?.message || "AI Companion request failed",
      });
    }
  });

  // Ensure unmatched /api/* routes always return JSON instead of falling through to index.html
  app.all("/api/{*splat}", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
  });

  // Frontend serving (Vite dev middleware in dev, dist/ static in prod)
  let vite: ViteDevServer | null = null;
  if (!IS_PROD) {
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Express error boundary so malformed/failed requests never terminate the process
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("[SmartRoutes] Express error:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || "Internal server error" });
      }
    },
  );

  const server = app.listen(PORT, HOST, () => {
    console.log(`SmartRoutes 3.0 server running on http://${HOST}:${PORT}`);
  });

  server.on("error", (err) => {
    console.error("[SmartRoutes] HTTP server error:", err);
  });

  const shutdown = async () => {
    server.close();
    if (vite) {
      await vite.close().catch(() => {});
    }
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

startServer().catch((err) => {
  console.error("Failed to start SmartRoutes server:", err);
  process.exit(1);
});
