import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type {
  CommunityReport,
  DiscoveredPOI,
  PredictiveRouteResult,
} from "../../types/mobility";

interface MobilityMap2DProps {
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  discoveredPOIs: DiscoveredPOI[];
  onAddPOIToRoute?: (poi: DiscoveredPOI) => void;
  communityReports: CommunityReport[];
  theme: "light" | "dark";
  mapPickMode: "none" | "origin" | "destination" | "report";
  onMapClick: (lat: number, lng: number) => void;
  focusPoint?: { lat: number; lng: number } | null;
}

function BoundsController({
  routeResult,
  selectedRouteId,
  focusPoint,
}: {
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  focusPoint?: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    const t = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);
    return () => window.clearTimeout(t);
  }, [map]);

  useEffect(() => {
    if (!routeResult) return;
    const active =
      routeResult.alternatives.find((a) => a.routeId === selectedRouteId) ||
      routeResult.alternatives[0];
    if (!active || active.geometry.length < 2) return;
    const bounds = L.latLngBounds(active.geometry as [number, number][]);
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 16 });
  }, [map, routeResult, selectedRouteId]);

  useEffect(() => {
    if (!focusPoint) return;
    map.flyTo([focusPoint.lat, focusPoint.lng], Math.max(map.getZoom(), 14), {
      duration: 0.65,
    });
  }, [map, focusPoint]);

  return null;
}

function ClickHandler({
  active,
  onClick,
}: {
  active: boolean;
  onClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (active) {
        onClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

function poiColor(category: DiscoveredPOI["category"]): string {
  switch (category) {
    case "hospital":
    case "fire":
      return "#dc2626";
    case "police":
      return "#2563eb";
    case "charging":
      return "#059669";
    case "fuel":
      return "#d97706";
    case "parking":
      return "#4f46e5";
    default:
      return "#0f766e";
  }
}

export function MobilityMap2D({
  routeResult,
  selectedRouteId,
  onSelectRoute,
  discoveredPOIs,
  onAddPOIToRoute,
  communityReports,
  theme,
  mapPickMode,
  onMapClick,
  focusPoint,
}: MobilityMap2DProps) {
  const defaultCenter: [number, number] = useMemo(() => {
    if (routeResult) {
      return [routeResult.origin.lat, routeResult.origin.lng];
    }
    return [40.7484, -73.9857];
  }, [routeResult]);

  const tileUrl =
    theme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  const tileAttribution =
    theme === "dark"
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const isEmergency = Boolean(routeResult?.isEmergency);

  return (
    <div
      className={`relative w-full h-full ${mapPickMode !== "none" ? "cursor-crosshair" : ""}`}
    >
      <MapContainer
        center={defaultCenter}
        zoom={13}
        className="w-full h-full z-0"
        scrollWheelZoom
      >
        <TileLayer key={theme} url={tileUrl} attribution={tileAttribution} />
        <BoundsController
          routeResult={routeResult}
          selectedRouteId={selectedRouteId}
          focusPoint={focusPoint}
        />
        <ClickHandler active={mapPickMode !== "none"} onClick={onMapClick} />

        {/* Non-selected alternative routes */}
        {routeResult?.alternatives
          .filter((a) => a.routeId !== selectedRouteId)
          .map((alt) => (
            <Polyline
              key={alt.routeId}
              positions={alt.geometry}
              pathOptions={{
                color: theme === "dark" ? "#94a3b8" : "#64748b",
                weight: 4,
                opacity: 0.55,
                dashArray: "8 6",
              }}
              eventHandlers={{
                click: () => onSelectRoute(alt.routeId),
              }}
            >
              <Popup>
                <div className="text-xs space-y-1">
                  <p className="font-semibold">{alt.label}</p>
                  <p>
                    {alt.distanceKm} km · ~{alt.durationMin} min (OSRM est.)
                  </p>
                  <p>
                    Turns: {alt.turns.maneuverCount} ({alt.turns.complexityLabel})
                  </p>
                  <button
                    type="button"
                    onClick={() => onSelectRoute(alt.routeId)}
                    className="mt-1 px-2 py-1 bg-blue-600 text-white rounded text-xs"
                  >
                    Select Route
                  </button>
                </div>
              </Popup>
            </Polyline>
          ))}

        {/* Active selected route */}
        {routeResult?.alternatives
          .filter((a) => a.routeId === selectedRouteId)
          .map((alt) => (
            <Polyline
              key={alt.routeId}
              positions={alt.geometry}
              pathOptions={{
                color: isEmergency ? "#dc2626" : "#2563eb",
                weight: 6,
                opacity: 0.92,
              }}
            >
              <Popup>
                <div className="text-xs space-y-1">
                  <p className="font-semibold">
                    {isEmergency ? "Emergency Route" : alt.label}
                  </p>
                  <p>
                    {alt.distanceKm} km · ~{alt.durationMin} min (OSRM est.)
                  </p>
                  <p>Quality Score: {alt.qualityScore}/100</p>
                </div>
              </Popup>
            </Polyline>
          ))}

        {/* Origin Marker */}
        {routeResult && (
          <CircleMarker
            center={[routeResult.origin.lat, routeResult.origin.lng]}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#16a34a",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">Origin</p>
                <p>{routeResult.origin.address}</p>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* Waypoint Stops */}
        {routeResult?.waypoints.map((wp, idx) => (
          <CircleMarker
            key={wp.id}
            center={[wp.lat, wp.lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#d97706",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">
                  Stop {idx + 1}: {wp.label || wp.address}
                </p>
                <p>{wp.address}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Destination Marker */}
        {routeResult && (
          <CircleMarker
            center={[routeResult.destination.lat, routeResult.destination.lng]}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: isEmergency ? "#dc2626" : "#1d4ed8",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">
                  {isEmergency ? "Emergency Destination" : "Destination"}
                </p>
                <p>{routeResult.destination.address}</p>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* Discovered POIs */}
        {discoveredPOIs.map((poi) => (
          <CircleMarker
            key={poi.id}
            center={[poi.lat, poi.lng]}
            radius={6}
            pathOptions={{
              color: "#ffffff",
              weight: 1.5,
              fillColor: poiColor(poi.category),
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1 max-w-[210px]">
                <p className="font-semibold">{poi.name}</p>
                <p className="text-slate-600 capitalize">
                  {poi.category} · {poi.distanceKm} km away
                </p>
                <p className="text-slate-600">{poi.address}</p>
                <p className="text-slate-500">Status: {poi.availabilityStatus}</p>
                {onAddPOIToRoute && (
                  <button
                    type="button"
                    onClick={() => onAddPOIToRoute(poi)}
                    className="mt-1 px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-medium"
                  >
                    Add as Journey Stop
                  </button>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Community Road Reports */}
        {communityReports.map((rep) => (
          <CircleMarker
            key={rep._id}
            center={[rep.lat, rep.lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor:
                rep.severity === "high"
                  ? "#dc2626"
                  : rep.severity === "moderate"
                    ? "#f59e0b"
                    : "#64748b",
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1 max-w-[210px]">
                <p className="font-semibold capitalize">
                  Community Report: {rep.type.replace("_", " ")}
                </p>
                <p>{rep.description}</p>
                <p className="text-slate-500">
                  Severity: {rep.severity} · {rep.verificationStatus} ({rep.confirmations} confirm)
                </p>
                <p className="text-slate-400">Source: Community submitted</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
