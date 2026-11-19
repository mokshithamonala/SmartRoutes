import type { WeatherSnapshot } from "../../src/types/mobility";

const weatherCache = new Map<string, { expires: number; data: WeatherSnapshot }>();
const WEATHER_TTL_MS = 10 * 60 * 1000;

const WMO_LABELS: Record<number, { label: string; severe?: string }> = {
  0: { label: "Clear sky" },
  1: { label: "Mainly clear" },
  2: { label: "Partly cloudy" },
  3: { label: "Overcast" },
  45: { label: "Fog", severe: "Reduced visibility due to fog" },
  48: { label: "Depositing rime fog", severe: "Freezing fog — slippery road surfaces possible" },
  51: { label: "Light drizzle" },
  53: { label: "Moderate drizzle" },
  55: { label: "Dense drizzle" },
  61: { label: "Slight rain" },
  63: { label: "Moderate rain" },
  65: { label: "Heavy rain", severe: "Heavy rainfall — increased braking distance" },
  66: { label: "Light freezing rain", severe: "Freezing rain warning — icy roads" },
  67: { label: "Heavy freezing rain", severe: "Severe freezing rain — hazardous driving" },
  71: { label: "Slight snow fall" },
  73: { label: "Moderate snow fall", severe: "Snow accumulation on roadway" },
  75: { label: "Heavy snow fall", severe: "Heavy snowfall — low visibility & traction" },
  80: { label: "Rain showers" },
  81: { label: "Moderate rain showers" },
  82: { label: "Violent rain showers", severe: "Intense rain showers — hydroplaning risk" },
  95: { label: "Thunderstorm", severe: "Active thunderstorm in corridor" },
  96: { label: "Thunderstorm with slight hail", severe: "Thunderstorm and hail advisory" },
  99: { label: "Thunderstorm with heavy hail", severe: "Severe thunderstorm with heavy hail" },
};

function aqiCategory(usAqi?: number): string | undefined {
  if (typeof usAqi !== "number") return undefined;
  if (usAqi <= 50) return "Good";
  if (usAqi <= 100) return "Moderate";
  if (usAqi <= 150) return "Unhealthy for Sensitive Groups";
  if (usAqi <= 200) return "Unhealthy";
  return "Very Unhealthy";
}

export async function getWeatherContext(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", lat.toFixed(4));
    forecastUrl.searchParams.set("longitude", lng.toFixed(4));
    forecastUrl.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m",
    );

    const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    airUrl.searchParams.set("latitude", lat.toFixed(4));
    airUrl.searchParams.set("longitude", lng.toFixed(4));
    airUrl.searchParams.set("current", "us_aqi,european_aqi,pm2_5");

    const [weatherRes, airRes] = await Promise.all([
      fetch(forecastUrl.toString(), { signal: AbortSignal.timeout(7000) }),
      fetch(airUrl.toString(), { signal: AbortSignal.timeout(7000) }).catch(() => null),
    ]);

    if (!weatherRes.ok) {
      throw new Error(`Open-Meteo returned HTTP ${weatherRes.status}`);
    }

    const wJson = (await weatherRes.json()) as {
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        precipitation?: number;
        rain?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };

    const current = wJson.current || {};
    const code = typeof current.weather_code === "number" ? current.weather_code : undefined;
    const wmo = code !== undefined ? WMO_LABELS[code] : undefined;

    let severeWarning: string | null = wmo?.severe || null;
    if (!severeWarning && typeof current.wind_speed_10m === "number" && current.wind_speed_10m >= 50) {
      severeWarning = `High wind speed (${Math.round(current.wind_speed_10m)} km/h) — watch for crosswinds`;
    }

    let airQuality: WeatherSnapshot["airQuality"] = null;
    if (airRes && airRes.ok) {
      const airJson = (await airRes.json()) as {
        current?: { us_aqi?: number; european_aqi?: number; pm2_5?: number };
      };
      if (airJson.current) {
        airQuality = {
          usAqi: airJson.current.us_aqi,
          europeanAqi: airJson.current.european_aqi,
          pm25: airJson.current.pm2_5,
          category: aqiCategory(airJson.current.us_aqi),
        };
      }
    }

    const snapshot: WeatherSnapshot = {
      available: true,
      provider: "Open-Meteo Verified Forecast & Air Quality",
      timestamp: Date.now(),
      location: { lat, lng },
      temperatureC: current.temperature_2m,
      apparentTemperatureC: current.apparent_temperature,
      precipitationMm: current.precipitation,
      rainMm: current.rain,
      windSpeedKmh: current.wind_speed_10m,
      weatherCode: code,
      conditionLabel: wmo?.label || "Conditions reported",
      severeWarning,
      airQuality,
      coverageNote: `Point observation at ${lat.toFixed(3)}, ${lng.toFixed(3)}`,
    };

    weatherCache.set(key, { expires: Date.now() + WEATHER_TTL_MS, data: snapshot });
    return snapshot;
  } catch (err: any) {
    return {
      available: false,
      provider: "Open-Meteo",
      timestamp: Date.now(),
      location: { lat, lng },
      coverageNote: "Weather provider unreachable — no environmental conditions fabricated.",
      error: err?.message || "Weather service temporarily unavailable",
    };
  }
}
