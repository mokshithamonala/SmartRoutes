# 🚗 SmartRoutes 3.0 — AI Driving Intelligence & 3D Mobility Platform

**SmartRoutes 3.0** is an advanced AI-powered driving companion and urban mobility intelligence platform that combines intelligent route planning, interactive 2D maps, immersive 3D city visualization, environmental insights, and AI-driven driving assistance.

Built on the existing SmartRoutes application, version 3.0 extends its capabilities into a synchronized full-stack mobility platform using open geographic services, real-time environmental data, and server-side Gemini function calling.

## 🌐 Live Deployment

**live url:** https://smartroutes-backend.onrender.com/

**GitHub Repository:** https://github.com/mokshithamonala/SmartRoutes

> Note: The backend URL is the deployed API endpoint, not necessarily the frontend application URL.

## ✨ Key Features

### 🗺️ Intelligent 2D Navigation
- Interactive maps powered by OpenStreetMap and Leaflet.
- Driving route geometry, distance, and estimated travel duration through OSRM.
- Location search and geocoding using Nominatim.
- Nearby places and urban infrastructure discovery through Overpass API.

### 🌆 3D Urban Mobility Digital Twin
- Immersive 3D city visualization using Three.js.
- Extruded OpenStreetMap buildings and road networks.
- Animated vehicles and synchronized route visualization.
- Integrated stops, community reports, and mobility information.
- Dynamic Day/Night lighting modes.

### 🤖 AI Driving Companion
- Gemini-powered conversational driving assistant.
- Six modular AI function-calling tools.
- Server-side AI integration using the Google GenAI SDK.
- Intelligent assistance for navigation and mobility-related queries.

### 🌤️ Environmental Intelligence
- Weather information through Open-Meteo.
- Air quality monitoring and environmental context.
- Environmental insights to support informed travel decisions.
- Transparent handling of unavailable environmental data.

### 🚨 Smart Mobility & Community Support
- Journey management and cloud persistence through Convex.
- Community reports and user preferences.
- Emergency decision-support information.
- Preserved parking, route, and emergency modules.

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS |
| Navigation | React Router |
| Maps | OpenStreetMap, Leaflet, React Leaflet v5 |
| Routing | OSRM |
| Geocoding | Nominatim |
| Places & Infrastructure | Overpass API |
| 3D Visualization | Three.js, React Three Fiber v9, Drei v10 |
| AI Integration | Google Gemini, `@google/genai` |
| Backend | Node.js, Express |
| Database & Persistence | Convex |
| Weather & Air Quality | Open-Meteo |
| Charts | Recharts |
| Icons | Lucide React |

## 🏗️ System Architecture

```text
                 SMARTROUTES 3.0
                        |
          +-------------+-------------+
          |                           |
      React 19                    Express
      TypeScript                  Backend
          |                           |
    +-----+------+              Gemini AI
    |            |              Function Calling
  2D Maps      3D City                |
    |          Digital Twin      AI Agent Tools
    |
    +-------------------------------+
    |               |               |
   OSRM         OpenStreetMap    Open-Meteo
    |               |               |
 Routing       Geographic       Weather &
               Information      Air Quality

                  Convex
                    |
        Journeys | Community
        Preferences | Persistence
```

## 🔑 Environment Variables

Create a `.env.local` file in the project root using `.env.example` as a reference.

```env
# Convex Configuration
CONVEX_DEPLOYMENT=
CONVEX_DEPLOY_KEY=
VITE_CONVEX_URL=https://ceaseless-ant-468.convex.cloud
CONVEX_SITE_URL=https://ceaseless-ant-468.convex.site

# Gemini AI - Server Side Only
GEMINI_API_KEY=

# Geographic Service Endpoints
OSRM_BASE_URL=https://router.project-osrm.org
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
OVERPASS_BASE_URL=https://overpass-api.de/api/interpreter
```

### Environment Configuration

- **Google AI Studio:** Configure `GEMINI_API_KEY` under Settings → Secrets.
- **Local Development:** Store secrets in `.env.local`.
- **Convex:** Configure deployment credentials and environment variables in your Convex deployment.
- **Production:** Add the required environment variables to your hosting provider.

**Security:** Never expose `GEMINI_API_KEY` through frontend variables such as `VITE_GEMINI_API_KEY`. Never commit `.env.local` or private credentials to GitHub.

## 💻 Installation & Setup

### Prerequisites
- Node.js and npm
- Git
- Convex account (for cloud persistence)
- Gemini API key (for AI functionality)

### 1. Clone the Repository

```bash
git clone https://github.com/mokshithamonala/SmartRoutes.git
cd SmartRoutes
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create `.env.local` and configure the required environment variables.

### 4. Start the Development Server

```bash
npm run dev
```

The application starts with the Express API and Vite development server on the configured port (3000 by default).

### 5. Start Convex (Optional)

Open a second terminal:

```bash
npx convex dev
```

This synchronizes the Convex schema and backend functions.

### 6. Build for Production

```bash
npm run build
```

### 7. Start the Production Server

```bash
npm start
```

## 📡 External APIs & Data Sources

| Service | Purpose |
|---|---|
| OpenStreetMap | Geographic map data |
| OSRM | Driving routes and estimated travel duration |
| Nominatim | Geocoding and location search |
| Overpass API | Nearby places and infrastructure |
| Open-Meteo | Weather and air quality information |
| Google Gemini | AI-powered driving assistance |
| Convex | Cloud persistence and backend functions |

## 📊 Data Accuracy & Limitations

SmartRoutes prioritizes transparency and responsible use of external data.

- **Traffic:** OSRM provides road-network routing and free-flow duration estimates, not real-time traffic congestion.
- **Parking:** Parking occupancy remains unknown unless a live sensor data source is connected.
- **Weather:** Weather and air quality information are obtained from Open-Meteo.
- **Emergency Assistance:** Provides decision-support information only. It cannot dispatch emergency services or control actual traffic signals.
- **Demonstration Data:** Legacy simulated camera congestion feeds, parking reservations, and green-corridor alerts are explicitly identified as demonstration data.

## 🔮 Vision

SmartRoutes aims to make urban mobility smarter, safer, and more accessible by bringing together AI-powered driving assistance, intelligent navigation, environmental awareness, and immersive 3D city intelligence.

## 👩‍💻 Developer

**Sai Mokshitha Monala**

- GitHub: https://github.com/mokshithamonala
- Project Repository: https://github.com/mokshithamonala/SmartRoutes
- Backend Deployment: https://smartroutes-backend.onrender.com/

---

<p align="center">
  <b>SmartRoutes 3.0 — Navigate Smarter. Drive Safer. Explore Better. 🚗</b>
</p>
