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
} from "lucide-react";
import type {
  CommunityReport,
  DiscoveredPOI,
  PredictiveRouteResult,
  UrbanContextData,
  WeatherSnapshot,
} from "../../types/mobility";
import { MobilityMap2D } from "./MobilityMap2D";

const UrbanDigitalTwin3D = lazy(() => import("./UrbanDigitalTwin3D"));

class TwinErrorBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onFallback: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-200 p-6 text-center">
          <p className="font-semibold mb-2">3D Twin could not initialize WebGL</p>
          <p className="text-xs text-slate-400 mb-4">
            Your browser or GPU environment may restrict WebGL rendering.
          </p>
          <button
            type="button"
            onClick={this.props.onFallback}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium"
          >
            Switch to 2D OpenStreetMap
          </button>
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
  discoveredPOIs: DiscoveredPOI[];
  onAddPOIToRoute: (poi: DiscoveredPOI) => void;
  communityReports: CommunityReport[];
  urbanContext: UrbanContextData | null;
  weather: WeatherSnapshot | null;
  theme: "light" | "dark";
  nightScene3D: boolean;
  onToggleNightScene3D: () => void;
  mapPickMode: "none" | "origin" | "destination" | "report";
  onCancelMapPick: () => void;
  onMapClick: (lat: number, lng: number) => void;
  focusPoint?: { lat: number; lng: number } | null;
}

export function MapViewport(props: MapViewportProps) {
  const {
    viewMode,
    onChangeViewMode,
    weather,
    mapPickMode,
    onCancelMapPick,
  } = props;

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

        {/* Verified Weather & Environmental Context Bar (Open-Meteo) */}
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
              {weather.airQuality?.usAqi !== undefined && (
                <span className="hidden lg:inline whitespace-nowrap">
                  AQI {weather.airQuality.usAqi} ({weather.airQuality.category})
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
              Weather: {weather ? "Unavailable" : "Select route to load Open-Meteo context"}
            </span>
          )}
        </div>
      </div>

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
            discoveredPOIs={props.discoveredPOIs}
            onAddPOIToRoute={props.onAddPOIToRoute}
            communityReports={props.communityReports}
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
                discoveredPOIs={props.discoveredPOIs}
                communityReports={props.communityReports}
                urbanContext={props.urbanContext}
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
                discoveredPOIs={props.discoveredPOIs}
                onAddPOIToRoute={props.onAddPOIToRoute}
                communityReports={props.communityReports}
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
                    discoveredPOIs={props.discoveredPOIs}
                    communityReports={props.communityReports}
                    urbanContext={props.urbanContext}
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
