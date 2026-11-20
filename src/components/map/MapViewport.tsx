import React, { Component, Suspense, lazy, type ReactNode } from "react";
import {
  Map as MapIcon,
  Box,
  Columns2,
  CloudRain,
  Sun,
  Wind,
  AlertTriangle,
  Crosshair,
  X,
  Volume2,
  VolumeX,
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  RotateCcw,
  Flag,
  Square,
  Pause,
  Play,
  Gauge,
  Radio,
} from "lucide-react";
import type {
  CommunityReport,
  DiscoveredPOI,
  GeoPoint,
  JourneyStop,
  LiveTrafficSnapshot,
  PredictiveRouteResult,
  RouteStepInstruction,
  UrbanContextData,
  VoiceLanguage,
  WeatherSnapshot,
} from "../../types/mobility";
import type { LiveNavigationController } from "../../hooks/useLiveNavigation";
import { VOICE_LANGUAGE_LABELS } from "../../services/voiceNavigationService";
import { MobilityMap2D } from "./MobilityMap2D";

const UrbanDigitalTwin3D = lazy(async () => {
  try {
    return await import("./UrbanDigitalTwin3D");
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return await import("./UrbanDigitalTwin3D");
  }
});

class TwinErrorBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: ReactNode; onFallback: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }
  static getDerivedStateFromError(error: unknown) {
    const msg = error instanceof Error ? error.message : "Could not load 3D scene.";
    return { hasError: true, errorMessage: msg };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-200 p-6 text-center">
          <p className="font-semibold mb-2">3D Twin could not initialize</p>
          <p className="text-xs text-slate-400 mb-4 max-w-sm">
            {this.state.errorMessage || "Your browser or GPU environment may restrict WebGL rendering."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: "" })}
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-medium"
            >
              Retry 3D Twin
            </button>
            <button
              type="button"
              onClick={this.props.onFallback}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
            >
              Switch to 2D OpenStreetMap
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export type MapViewMode = "2d" | "3d" | "split";

interface MapViewportProps {
  viewMode: MapViewMode;
  onChangeViewMode: (mode: MapViewMode) => void;
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  destination?: GeoPoint | null;
  waypoints?: JourneyStop[];
  discoveredPOIs: DiscoveredPOI[];
  selectedPOI?: DiscoveredPOI | null;
  onSelectPOI?: (poi: DiscoveredPOI) => void;
  onAddPOIToRoute: (poi: DiscoveredPOI) => void;
  communityReports: CommunityReport[];
  urbanContext: UrbanContextData | null;
  weather: WeatherSnapshot | null;
  liveTraffic: LiveTrafficSnapshot | null;
  liveNav: LiveNavigationController;
  theme: "light" | "dark";
  nightScene3D: boolean;
  onToggleNightScene3D: () => void;
  mapPickMode: "none" | "origin" | "destination" | "report";
  onCancelMapPick: () => void;
  onMapClick: (lat: number, lng: number) => void;
  focusPoint?: { lat: number; lng: number } | null;
}

function ManeuverIcon({ step }: { step: RouteStepInstruction | null }) {
  if (!step) return <ArrowUp className="w-5 h-5" />;
  if (step.maneuverType === "arrive") return <Flag className="w-5 h-5" />;
  const mod = (step.modifier || "").toLowerCase();
  if (mod === "uturn") return <RotateCcw className="w-5 h-5" />;
  if (mod.includes("left")) return <CornerUpLeft className="w-5 h-5" />;
  if (mod.includes("right")) return <CornerUpRight className="w-5 h-5" />;
  return <ArrowUp className="w-5 h-5" />;
}

function formatStepDist(meters: number | null): string {
  if (meters === null) return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}

export function MapViewport(props: MapViewportProps) {
  const {
    viewMode,
    onChangeViewMode,
    weather,
    liveTraffic,
    liveNav,
    mapPickMode,
    onCancelMapPick,
  } = props;

  const nav = liveNav.snapshot;
  const showNavHud = nav.isNavigating || nav.status === "arrived" || Boolean(nav.gpsError);

  const formattedEta = nav.etaTimestamp
    ? new Date(nav.etaTimestamp).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "--:--";

  return (
    <div className="flex flex-col h-full w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Compact Workspace Map Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => onChangeViewMode("2d")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              viewMode === "2d"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            2D Map
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("3d")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              viewMode === "3d"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            3D Twin
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("split")}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              viewMode === "split"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            Split 2D/3D
          </button>
        </div>

        {/* Verified Weather & Live Traffic Context Bar */}
        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums overflow-x-auto">
          {weather?.available ? (
            <>
              <span className="flex items-center gap-1 whitespace-nowrap">
                {weather.rainMm && weather.rainMm > 0 ? (
                  <CloudRain className="w-3.5 h-3.5 text-blue-500" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
                {weather.temperatureC !== undefined
                  ? `${Math.round(weather.temperatureC)}°C`
                  : "—"}
                <span className="font-sans text-slate-500 dark:text-slate-400">
                  {weather.conditionLabel}
                </span>
              </span>
              {weather.windSpeedKmh !== undefined && (
                <span className="hidden sm:flex items-center gap-1 whitespace-nowrap">
                  <Wind className="w-3.5 h-3.5 text-slate-400" />
                  {Math.round(weather.windSpeedKmh)} km/h
                </span>
              )}
              {weather.severeWarning && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-sans font-medium whitespace-nowrap">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {weather.severeWarning}
                </span>
              )}
            </>
          ) : (
            <span className="font-sans text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Weather: {weather ? "Unavailable" : "Select route"}
            </span>
          )}

          <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:inline-block" />

          {/* Honest Live Traffic Indicator */}
          {liveTraffic?.available && liveTraffic.flow ? (
            <span className="hidden sm:flex items-center gap-1 whitespace-nowrap font-sans text-emerald-700 dark:text-emerald-400">
              <Radio className="w-3.5 h-3.5" />
              Live Traffic: {liveTraffic.flow.congestionLevel} ({liveTraffic.flow.currentSpeedKmh} km/h)
            </span>
          ) : (
            <span
              className="hidden sm:inline font-sans text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap"
              title={
                liveTraffic?.reason ||
                "Live traffic API not configured; using OSRM road-speed estimates."
              }
            >
              Traffic: OSRM est. (no live feed)
            </span>
          )}
        </div>
      </div>

      {/* Google Maps-style Live Turn-by-Turn Navigation & Voice HUD (stays active across 2D / 3D / Split) */}
      {showNavHud && (
        <div
          className={`px-3 py-2.5 border-b text-white ${
            nav.isOffRoute
              ? "bg-amber-700 border-amber-800"
              : nav.status === "arrived"
                ? "bg-emerald-700 border-emerald-800"
                : nav.status === "preview_demo"
                  ? "bg-violet-900 border-violet-800"
                  : "bg-slate-900 border-slate-800"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Primary Maneuver Cue */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <ManeuverIcon step={nav.nextStep} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/15">
                    {nav.status === "gps_active"
                      ? "Live GPS"
                      : nav.status === "preview_demo"
                        ? "Simulated Preview (Demo)"
                        : nav.status === "arrived"
                          ? "Arrived"
                          : "GPS Notice"}
                  </span>
                  {nav.distanceToNextStepM !== null && nav.isNavigating && (
                    <span className="font-mono tabular-nums text-xs font-semibold text-blue-200">
                      in {formatStepDist(nav.distanceToNextStepM)}
                    </span>
                  )}
                  {nav.isOffRoute && (
                    <span className="text-xs font-semibold text-amber-100">
                      Off route ({nav.offRouteDistanceM} m){nav.isRecalculating ? " · Recalculating..." : ""}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold leading-snug truncate">
                  {nav.status === "arrived"
                    ? "You have arrived at your destination"
                    : nav.nextStep?.instruction || "Follow the active route"}
                </p>
                {nav.followingStep && nav.isNavigating && (
                  <p className="text-[11px] text-white/75 truncate">
                    Then: {nav.followingStep.instruction}
                  </p>
                )}
              </div>
            </div>

            {/* Live Progress Telemetry & Voice / Language Controls */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {nav.isNavigating && (
                <div className="flex items-center gap-2.5 px-2.5 py-1 rounded-lg bg-black/25 font-mono tabular-nums text-xs">
                  <span>{nav.remainingDistanceKm.toFixed(1)} km</span>
                  <span className="text-white/40">·</span>
                  <span>{nav.remainingDurationMin} min</span>
                  <span className="text-white/40">·</span>
                  <span>ETA {formattedEta}</span>
                  {nav.currentPosition?.speedKmh != null && (
                    <>
                      <span className="text-white/40 hidden sm:inline">·</span>
                      <span className="hidden sm:inline">
                        {nav.currentPosition.speedKmh} km/h
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Simulated Preview Playback Controls */}
              {nav.status === "preview_demo" && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={liveNav.togglePreviewPause}
                    title={liveNav.previewPaused ? "Resume preview" : "Pause preview"}
                    className="p-1.5 rounded-md bg-white/15 hover:bg-white/25 transition-colors"
                  >
                    {liveNav.previewPaused ? (
                      <Play className="w-3.5 h-3.5" />
                    ) : (
                      <Pause className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={liveNav.cyclePreviewSpeed}
                    title="Cycle preview speed"
                    className="px-2 py-1 rounded-md bg-white/15 hover:bg-white/25 text-[11px] font-mono flex items-center gap-1"
                  >
                    <Gauge className="w-3 h-3" />
                    {liveNav.previewSpeedMultiplier}x
                  </button>
                </div>
              )}

              {/* Language Switcher: EN / HI / TE */}
              <div
                className="flex items-center rounded-md bg-black/25 p-0.5"
                role="group"
                aria-label="Voice navigation language"
              >
                {(["en", "hi", "te"] as VoiceLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => liveNav.setVoiceLanguage(lang)}
                    title={`Voice guidance in ${VOICE_LANGUAGE_LABELS[lang].name}`}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                      nav.voiceLanguage === lang
                        ? "bg-white text-slate-900"
                        : "text-white/80 hover:text-white"
                    }`}
                  >
                    {VOICE_LANGUAGE_LABELS[lang].short}
                  </button>
                ))}
              </div>

              {/* Mute / Unmute Voice Guidance */}
              <button
                type="button"
                onClick={liveNav.toggleVoice}
                title={nav.voiceEnabled ? "Mute voice guidance" : "Unmute voice guidance"}
                className={`p-1.5 rounded-md transition-colors ${
                  nav.voiceEnabled
                    ? "bg-white/20 hover:bg-white/30 text-white"
                    : "bg-black/30 hover:bg-black/40 text-white/60"
                }`}
              >
                {nav.voiceEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>

              {/* Stop Navigation */}
              <button
                type="button"
                onClick={liveNav.stopNavigation}
                title="Stop navigation"
                className="px-2.5 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1"
              >
                <Square className="w-3 h-3" />
                Stop
              </button>
            </div>
          </div>

          {nav.gpsError && (
            <p className="mt-1.5 text-[11px] text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {nav.gpsError}
            </p>
          )}
        </div>
      )}

      {/* Interactive Map Pick Mode Banner */}
      {mapPickMode !== "none" && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-600 text-white text-xs font-medium">
          <span className="flex items-center gap-2">
            <Crosshair className="w-4 h-4" />
            Click anywhere on the 2D map to set{" "}
            {mapPickMode === "origin"
              ? "starting location"
              : mapPickMode === "destination"
                ? "destination"
                : "community road report coordinates"}
          </span>
          <button
            type="button"
            onClick={onCancelMapPick}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      )}

      {/* Synchronized Spatial Viewport */}
      <div className="flex-1 min-h-[380px] relative">
        {viewMode === "2d" && (
          <MobilityMap2D
            routeResult={props.routeResult}
            selectedRouteId={props.selectedRouteId}
            onSelectRoute={props.onSelectRoute}
            destination={props.destination}
            waypoints={props.waypoints}
            discoveredPOIs={props.discoveredPOIs}
            selectedPOI={props.selectedPOI}
            onSelectPOI={props.onSelectPOI}
            onAddPOIToRoute={props.onAddPOIToRoute}
            communityReports={props.communityReports}
            liveNavigation={nav}
            liveTraffic={liveTraffic}
            theme={props.theme}
            mapPickMode={mapPickMode}
            onMapClick={props.onMapClick}
            focusPoint={props.focusPoint}
          />
        )}

        {viewMode === "3d" && (
          <TwinErrorBoundary onFallback={() => onChangeViewMode("2d")}>
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-300 text-sm">
                  Loading 3D Urban Mobility Digital Twin...
                </div>
              }
            >
              <UrbanDigitalTwin3D
                routeResult={props.routeResult}
                selectedRouteId={props.selectedRouteId}
                destination={props.destination}
                waypoints={props.waypoints}
                discoveredPOIs={props.discoveredPOIs}
                selectedPOI={props.selectedPOI}
                onSelectPOI={props.onSelectPOI}
                communityReports={props.communityReports}
                urbanContext={props.urbanContext}
                liveNavigation={nav}
                nightMode={props.nightScene3D}
                onToggleNightMode={props.onToggleNightScene3D}
                onSelectRoute={props.onSelectRoute}
              />
            </Suspense>
          </TwinErrorBoundary>
        )}

        {viewMode === "split" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 w-full h-full">
            <div className="h-full border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
              <MobilityMap2D
                routeResult={props.routeResult}
                selectedRouteId={props.selectedRouteId}
                onSelectRoute={props.onSelectRoute}
                destination={props.destination}
                waypoints={props.waypoints}
                discoveredPOIs={props.discoveredPOIs}
                selectedPOI={props.selectedPOI}
                onSelectPOI={props.onSelectPOI}
                onAddPOIToRoute={props.onAddPOIToRoute}
                communityReports={props.communityReports}
                liveNavigation={nav}
                liveTraffic={liveTraffic}
                theme={props.theme}
                mapPickMode={mapPickMode}
                onMapClick={props.onMapClick}
                focusPoint={props.focusPoint}
              />
            </div>
            <div className="h-full">
              <TwinErrorBoundary onFallback={() => onChangeViewMode("2d")}>
                <Suspense
                  fallback={
                    <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-300 text-sm">
                      Loading 3D Twin...
                    </div>
                  }
                >
                  <UrbanDigitalTwin3D
                    routeResult={props.routeResult}
                    selectedRouteId={props.selectedRouteId}
                    destination={props.destination}
                    waypoints={props.waypoints}
                    discoveredPOIs={props.discoveredPOIs}
                    selectedPOI={props.selectedPOI}
                    onSelectPOI={props.onSelectPOI}
                    communityReports={props.communityReports}
                    urbanContext={props.urbanContext}
                    liveNavigation={nav}
                    nightMode={props.nightScene3D}
                    onToggleNightMode={props.onToggleNightScene3D}
                    onSelectRoute={props.onSelectRoute}
                  />
                </Suspense>
              </TwinErrorBoundary>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
