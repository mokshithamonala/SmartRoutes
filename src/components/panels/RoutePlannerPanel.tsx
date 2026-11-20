import { useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  ListOrdered,
  Loader2,
  LocateFixed,
  Navigation,
  Play,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  FavouriteDestination,
  GeoPoint,
  JourneyStop,
  PredictiveRouteResult,
  RoutePreferences,
  SavedJourneyRecord,
  VoiceLanguage,
} from "../../types/mobility";
import type { LiveNavigationController } from "../../hooks/useLiveNavigation";
import { VOICE_LANGUAGE_LABELS } from "../../services/voiceNavigationService";
import { LocationSearchInput } from "./LocationSearchInput";

interface RoutePlannerPanelProps {
  origin: GeoPoint | null;
  destination: GeoPoint | null;
  waypoints: JourneyStop[];
  preferences: RoutePreferences;
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  isCalculating: boolean;
  savedJourneys: SavedJourneyRecord[];
  favourites: FavouriteDestination[];
  onChangeOrigin: (pt: GeoPoint | null) => void;
  onChangeDestination: (pt: GeoPoint | null) => void;
  onRemoveWaypoint: (id: string) => void;
  onChangePreferences: (prefs: RoutePreferences) => void;
  onCalculateRoute: () => void;
  onSelectRoute: (routeId: string) => void;
  onSaveJourney: () => Promise<void>;
  onLoadSavedJourney: (journey: SavedJourneyRecord) => void;
  onDeleteSavedJourney: (id: string) => Promise<void>;
  onRequestMapPick: (mode: "origin" | "destination") => void;
  onUseCurrentLocation: () => void;
  onAskAIExplainRoute: () => void;
  liveNav: LiveNavigationController;
}

export function RoutePlannerPanel(props: RoutePlannerPanelProps) {
  const [saving, setSaving] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await props.onSaveJourney();
    } finally {
      setSaving(false);
    }
  };

  const quickPresets: Array<{ label: string; origin: GeoPoint; destination: GeoPoint }> = [
    {
      label: "Tirupati Airport to Tirupati",
      origin: { lat: 13.6325, lng: 79.5433, address: "Tirupati Airport, Renigunta, Andhra Pradesh, India", label: "Tirupati Airport" },
      destination: { lat: 13.6288, lng: 79.4192, address: "Tirupati, Andhra Pradesh, India", label: "Tirupati" },
    },
    {
      label: "Midtown to Brooklyn Bridge",
      origin: { lat: 40.7549, lng: -73.984, address: "Bryant Park, Manhattan, New York, NY", label: "Bryant Park" },
      destination: { lat: 40.7061, lng: -73.9969, address: "Brooklyn Bridge, New York, NY", label: "Brooklyn Bridge" },
    },
  ];

  const activeAlt =
    props.routeResult?.alternatives.find((a) => a.routeId === props.selectedRouteId) ||
    props.routeResult?.alternatives[0] ||
    null;
  const nav = props.liveNav.snapshot;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Predictive Route Intelligence
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          OpenStreetMap geocoding and OSRM multi-stop route scoring synchronized across 2D and 3D views.
        </p>
      </div>

      {/* Journey Inputs */}
      <div className="space-y-3">
        <LocationSearchInput
          label="Origin"
          placeholder="Search starting address or city..."
          value={props.origin}
          onChange={props.onChangeOrigin}
          onRequestMapPick={() => props.onRequestMapPick("origin")}
          onUseCurrentLocation={props.onUseCurrentLocation}
          favourites={props.favourites}
        />

        <LocationSearchInput
          label="Destination"
          placeholder="Search destination address or landmark..."
          value={props.destination}
          onChange={props.onChangeDestination}
          onRequestMapPick={() => props.onRequestMapPick("destination")}
          favourites={props.favourites}
          near={props.origin ? { lat: props.origin.lat, lng: props.origin.lng } : undefined}
        />

        {/* Quick Real-Coordinate Journeys */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-slate-500 dark:text-slate-400">Try real route:</span>
          {quickPresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                props.onChangeOrigin(preset.origin);
                props.onChangeDestination(preset.destination);
                toast.info(`Loaded coordinates for ${preset.label}. Click Calculate Route.`);
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Active Intermediate Waypoints */}
        {props.waypoints.length > 0 && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Journey Stops ({props.waypoints.length})
              </span>
              {props.waypoints.length > 1 && (
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(props.preferences.optimizeStopOrder)}
                    onChange={(e) =>
                      props.onChangePreferences({
                        ...props.preferences,
                        optimizeStopOrder: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Optimize stop order
                </label>
              )}
            </div>
            {props.waypoints.map((wp, idx) => (
              <div
                key={wp.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <span className="truncate text-slate-700 dark:text-slate-200">
                  <strong className="font-mono mr-1.5">{idx + 1}.</strong>
                  {wp.label || wp.address}
                </span>
                <button
                  type="button"
                  onClick={() => props.onRemoveWaypoint(wp.id)}
                  aria-label="Remove stop"
                  className="text-slate-400 hover:text-red-500 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Route Preference Controls */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(
            [
              { id: "fastest", label: "Fastest" },
              { id: "shortest", label: "Shortest" },
              { id: "balanced", label: "Low Turns" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() =>
                props.onChangePreferences({
                  ...props.preferences,
                  routeType: opt.id,
                })
              }
              className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                props.preferences.routeType === opt.id
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={props.preferences.avoidTolls}
              onChange={(e) =>
                props.onChangePreferences({
                  ...props.preferences,
                  avoidTolls: e.target.checked,
                })
              }
              className="rounded border-slate-300 text-blue-600"
            />
            Prefer no tolls
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={props.preferences.avoidHighways}
              onChange={(e) =>
                props.onChangePreferences({
                  ...props.preferences,
                  avoidHighways: e.target.checked,
                })
              }
              className="rounded border-slate-300 text-blue-600"
            />
            Prefer local roads
          </label>
        </div>

        <button
          type="button"
          onClick={props.onCalculateRoute}
          disabled={props.isCalculating || !props.origin || !props.destination}
          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          {props.isCalculating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Calculating via OSRM...
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4" />
              Calculate &amp; Sync Route
            </>
          )}
        </button>
      </div>

      {/* Predictive Route Alternatives & Live Voice Navigation */}
      {props.routeResult && (
        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          {/* Live Voice Navigation Launch Bar */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                Turn-by-Turn AI Voice Navigation
              </span>
              <div className="flex items-center gap-1">
                {(["en", "hi", "te"] as VoiceLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => props.liveNav.setVoiceLanguage(lang)}
                    title={`Voice in ${VOICE_LANGUAGE_LABELS[lang].name}`}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                      nav.voiceLanguage === lang
                        ? "bg-blue-600 text-white"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {VOICE_LANGUAGE_LABELS[lang].short}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={props.liveNav.toggleVoice}
                  title={nav.voiceEnabled ? "Mute voice" : "Unmute voice"}
                  className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                >
                  {nav.voiceEnabled ? (
                    <Volume2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {!nav.isNavigating ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={props.liveNav.startGpsNavigation}
                  className="py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  Start Live GPS
                </button>
                <button
                  type="button"
                  onClick={props.liveNav.startPreviewSimulation}
                  className="py-2 px-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Preview (Demo)
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  {nav.status === "gps_active"
                    ? "Live GPS Active"
                    : "Simulated Route Preview (Demo)"}
                </span>
                <button
                  type="button"
                  onClick={props.liveNav.stopNavigation}
                  className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1"
                >
                  <Square className="w-3 h-3" />
                  Stop
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                Route Alternatives ({props.routeResult.alternatives.length})
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Confidence: {props.routeResult.predictionConfidence} · OSRM road-graph estimate
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={props.onAskAIExplainRoute}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Explain
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium flex items-center gap-1 whitespace-nowrap hover:opacity-90"
              >
                <Bookmark className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {props.routeResult.alternatives.map((alt) => {
              const selected = alt.routeId === props.selectedRouteId;
              return (
                <button
                  key={alt.routeId}
                  type="button"
                  onClick={() => props.onSelectRoute(alt.routeId)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selected
                      ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 dark:border-blue-500"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {alt.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {alt.tags.join(" · ") || "Alternative"}
                        {alt.isRecommended ? " · Recommended" : ""}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                      {alt.qualityScore}/100
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/60 font-mono tabular-nums text-xs">
                    <div>
                      <span className="block font-sans text-[10px] text-slate-500 dark:text-slate-400">
                        Est. Time
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {alt.durationMin} min
                      </span>
                    </div>
                    <div>
                      <span className="block font-sans text-[10px] text-slate-500 dark:text-slate-400">
                        Distance
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {alt.distanceKm} km
                      </span>
                    </div>
                    <div>
                      <span className="block font-sans text-[10px] text-slate-500 dark:text-slate-400">
                        Turns
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {alt.turns.maneuverCount} ({alt.turns.complexityLabel})
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                    {alt.explanation}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Collapsible OSRM Turn-by-Turn Directions */}
          {activeAlt && activeAlt.steps && activeAlt.steps.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setStepsExpanded((v) => !v)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <span className="flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Turn-by-Turn Directions ({activeAlt.steps.length} steps)
                </span>
                {stepsExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>
              {stepsExpanded && (
                <ol className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {activeAlt.steps.map((step, sIdx) => {
                    const isCurrent = nav.isNavigating && nav.currentStepIndex === sIdx;
                    return (
                      <li
                        key={step.index}
                        className={`px-3 py-2 flex items-start justify-between gap-2 ${
                          isCurrent
                            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium leading-snug">{step.instruction}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {step.roadName}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          {step.distanceMeters >= 1000
                            ? `${(step.distanceMeters / 1000).toFixed(1)} km`
                            : `${step.distanceMeters} m`}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {props.routeResult.confidenceReason}
          </p>
        </div>
      )}

      {/* Persistent Saved Journeys */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Saved Journeys ({props.savedJourneys.length})
          </h3>
        </div>

        {props.savedJourneys.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center">
            <Compass className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No saved journeys yet. Calculate a route and click Save to persist it across sessions.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
            {props.savedJourneys.map((j) => (
              <div
                key={j._id}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-start justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={() => props.onLoadSavedJourney(j)}
                  className="text-left min-w-0 flex-1"
                >
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {j.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                    {j.distanceKm} km · {j.durationMin} min · {j.waypoints.length} stops · Score {j.qualityScore}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void props.onDeleteSavedJourney(j._id)}
                  aria-label="Delete saved journey"
                  className="p-1 text-slate-400 hover:text-red-500 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
