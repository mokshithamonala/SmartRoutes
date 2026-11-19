# SmartRoutes 3.0 — AI Driving Intelligence & 3D Mobility Platform

SmartRoutes 3.0 extends the existing SmartRoutes / Smart Traffic Convex + React application into a full-stack AI driving companion and synchronized 2D/3D urban mobility intelligence platform built with open geographic services and server-side Gemini function calling.

## Core Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, React Router, Lucide React, Recharts
- **2D Map & Routing**: OpenStreetMap, Leaflet, React Leaflet v5, OSRM (`router.project-osrm.org`), Nominatim (`nominatim.openstreetmap.org`), Overpass API (`overpass-api.de`)
- **3D Urban Mobility Digital Twin**: Three.js, React Three Fiber v9, Drei v10 (synchronized with 2D map routes, extruded OSM buildings, road networks, animated vehicles, stops, reports, and Day/Night lighting)
- **Environmental Context**: Open-Meteo weather & air quality API
- **AI Driving Companion**: Server-side `@google/genai` SDK (`gemini-4-hydrogen`) with 6 modular function-calling agent tools
- **Persistence & Backend**: Express + Vite full-stack server (`server.ts`) and Convex backend (`convex/schema.ts`, `journeys.ts`, `community.ts`, `preferences.ts`, plus preserved `routes.ts`, `parking.ts`, `emergency.ts`, `chat.ts`)

## Environment Variables

Copy `.env.example` to `.env.local` (never commit `.env.local`) or configure secrets in your hosting environment:

```env
# Convex Backend (optional in local browser-persisted mode; required for multi-device cloud persistence)
CONVEX_DEPLOYMENT=
CONVEX_DEPLOY_KEY=
VITE_CONVEX_URL=https://ceaseless-ant-468.convex.cloud
CONVEX_SITE_URL=https://ceaseless-ant-468.convex.site

# Server-Side Gemini AI Key (NEVER expose via VITE_* or client code)
GEMINI_API_KEY=

# Open Geographic Service Endpoints (defaults shown)
OSRM_BASE_URL=https://router.project-osrm.org
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
OVERPASS_BASE_URL=https://overpass-api.de/api/interpreter
```

### Where to Configure Secrets
- **AI Studio Preview**: Set `GEMINI_API_KEY` in **Settings → Secrets**.
- **Local Development**: Place `GEMINI_API_KEY` and `VITE_CONVEX_URL` in `.env.local` (already gitignored).
- **Convex Deployment**: Run `npx convex dev` or `npx convex deploy` to push all functions in `/convex/` (including `journeys`, `community`, `preferences`, `auth`, `parking`, `routes`, `emergency`, `chat`) to your Convex project.

## Running Locally (Windows PowerShell / Linux / macOS)

```powershell
# 1. Install dependencies
npm install

# 2. Start the full-stack SmartRoutes 3.0 server (Express API + Vite on port 3000)
npm run dev

# 3. (Optional) Sync Convex schema & functions in a second terminal
npx convex dev

# 4. Production typecheck & bundle build
npm run build

# 5. Run production server
npm start
```

## Public API Usage & Data Honesty

- **OSRM**: Provides driving road-graph geometry, distance, and free-flow duration estimates. OSRM does **not** supply real-time traffic congestion.
- **OpenStreetMap Nominatim & Overpass**: Requests include rate limiting, response caching, and proper `User-Agent` headers. Parking occupancy is explicitly reported as unknown unless a live sensor feed is connected.
- **Open-Meteo**: Provides real weather and air quality metrics; unavailable responses are reported transparently without synthetic fallback values.
- **Emergency Assistance**: Decision-support only. SmartRoutes cannot dispatch emergency services or control real traffic signals.
- **Preserved Prototype Modules**: Legacy demo parking slot reservation, simulated camera congestion feeds, and demo green-corridor alerts remain accessible behind explicit "Demonstration Data" labels.
