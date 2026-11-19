import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { Box, Compass, Moon, ShieldAlert, Sparkles, Sun } from "lucide-react";
import { Toaster } from "sonner";
import { Authenticated, Unauthenticated, useQuery } from "./lib/convexAdapter";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { CommandCenter } from "./components/CommandCenter";

const THEME_STORAGE_KEY = "smartroutes_theme_v3";

function getInitialTheme(): "light" | "dark" {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    // fallback to light
  }
  return "light";
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => getInitialTheme());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <BrowserRouter>
      <AppShell theme={theme} onToggleTheme={toggleTheme} />
      <Toaster position="top-right" richColors theme={theme} />
    </BrowserRouter>
  );
}

function AppShell({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-9 w-9 border-2 border-slate-300 dark:border-slate-700 border-t-blue-600" />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Initializing SmartRoutes workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Authenticated>
        <CommandCenter theme={theme} onToggleTheme={onToggleTheme} />
      </Authenticated>

      <Unauthenticated>
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          <header className="h-14 px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-display font-bold text-xs">
                SR
              </div>
              <span className="font-display font-semibold text-base tracking-tight">
                SmartRoutes
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </header>

          <main className="flex-1 flex items-center justify-center px-4 py-10">
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              {/* Product Context Column */}
              <div className="md:col-span-7 space-y-5">
                <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                  AI Driving Intelligence &amp; 3D Urban Mobility Platform
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                  Plan multi-stop journeys with OpenStreetMap and OSRM, inspect corridors in a synchronized 2D/3D digital twin, discover real parking and emergency services, and collaborate with a tool-powered Gemini driving companion.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <Box className="w-4 h-4 text-blue-600 dark:text-blue-400 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Synchronized 2D &amp; 3D Twin
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Leaflet OpenStreetMap paired with Three.js extruded urban buildings and route vehicles.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Predictive Route Scoring
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Compare fastest, shortest, and low-turn OSRM alternatives with transparent explanations.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Agentic AI Driving Companion
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Server-side Gemini function calling that plans routes, checks weather, and finds stops.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-blue-400 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Community &amp; Emergency Tools
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Map-picked hazard reporting, Open-Meteo weather advisories, and hospital routing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Sign-In Card */}
              <div className="md:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-1">
                  Sign in to SmartRoutes
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                  Save journeys, driving preferences, favourites, and community road reports.
                </p>
                <SignInForm />
              </div>
            </div>
          </main>
        </div>
      </Unauthenticated>
    </>
  );
}
