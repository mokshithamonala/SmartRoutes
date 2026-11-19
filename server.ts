import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
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
import { runMultiAgentCompanion } from "./server/services/geminiAgentService";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === "production";

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Health & capability status (never exposes secrets)
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
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
      const radiusMeters = req.query.radius ? Number(req.query.radius) : 3500;
      const limit = req.query.limit ? Number(req.query.limit) : 12;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "Valid lat and lng are required." });
      }

      const pois = await discoverPOIs({ lat, lng, category, radiusMeters, limit });
      return res.json({
        pois,
        attribution: "© OpenStreetMap contributors",
        fetchedAt: Date.now(),
      });
    } catch (err: any) {
      return res.status(502).json({
        error: err?.message || "POI discovery failed",
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
        error: err?.message || "Urban context unavailable",
        buildings: [],
        roads: [],
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

  // Frontend serving (Vite dev middleware in dev, dist/ static in prod)
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SmartRoutes 3.0 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start SmartRoutes server:", err);
  process.exit(1);
});
