import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Circle,
  CircleMarker,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type {
  CommunityReport,
  DiscoveredPOI,
  GeoPoint,
  JourneyStop,
  LiveNavigationSnapshot,
  LiveTrafficSnapshot,
  PredictiveRouteResult,
} from "../../types/mobility";

interface MobilityMap2DProps {
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  destination?: GeoPoint | null;
  waypoints?: JourneyStop[];
  discoveredPOIs: DiscoveredPOI[];
  selectedPOI?: DiscoveredPOI | null;
  onSelectPOI?: (poi: DiscoveredPOI) => void;
  onAddPOIToRoute?: (poi: DiscoveredPOI) => void;
  communityReports: CommunityReport[];
  liveNavigation?: LiveNavigationSnapshot | null;
  liveTraffic?: LiveTrafficSnapshot | null;
  theme: "light" | "dark";
  mapPickMode: "none" | "origin" | "destination" | "report";
  onMapClick: (lat: number, lng: number) => void;
  focusPoint?: { lat: number; lng: number } | null;
}

function isPoiAlreadyInWaypoints(poi: DiscoveredPOI, waypoints: JourneyStop[]): boolean {
  return waypoints.some((w) => {
    if (w.sourcePoiId && w.sourcePoiId === poi.id) return true;
    const dLat = Math.abs(w.lat - poi.lat);
    const dLng = Math.abs(w.lng - poi.lng);
    return dLat < 0.00045 && dLng < 0.00045;
  });
}

function POIMarker({
  poi,
  isSelected,
  isInRoute,
  onSelectPOI,
  onAddPOIToRoute,
}: {
  poi: DiscoveredPOI;
  isSelected: boolean;
  isInRoute: boolean;
  onSelectPOI?: (poi: DiscoveredPOI) => void;
  onAddPOIToRoute?: (poi: DiscoveredPOI) => void;
}) {
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (isSelected && markerRef.current) {
      markerRef.current.openPopup();
    }
  }, [isSelected]);

  return (
    <CircleMarker
      ref={markerRef}
      center={[poi.lat, poi.lng]}
      radius={isSelected ? 9 : 6}
      pathOptions={{
        color: isSelected ? "#0f172a" : "#ffffff",
        weight: isSelected ? 3 : 1.5,
        fillColor: poiColor(poi.category),
        fillOpacity: isSelected ? 1 : 0.9,
      }}
      eventHandlers={{
        click: () => onSelectPOI?.(poi),
      }}
    >
      <Popup>
        <div className="text-xs space-y-1 max-w-[230px]">
          <p className="font-semibold text-slate-900">{poi.name}</p>
          <p className="text-slate-600 capitalize">
            {poi.category} · {poi.distanceKm.toFixed(2)} km
            {poi.referenceLabel ? ` from ${poi.referenceLabel}` : " away"}
          </p>
          <p className="text-slate-700">
            <span className="font-medium">Address:</span>{" "}
            {poi.address || "Not available"}
          </p>
          <p className="text-slate-500 font-mono text-[11px]">
            {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
          </p>
          {poi.openingHours && (
            <p className="text-slate-600">
              <span className="font-medium">Hours:</span> {poi.openingHours}
            </p>
          )}
          {poi.phone && (
            <p className="text-slate-600">
              <span className="font-medium">Contact:</span> {poi.phone}
            </p>
          )}
          <p className="text-slate-500">Status: {poi.availabilityStatus}</p>
          <p className="text-[10px] text-slate-400">Source: {poi.source}</p>
          {onAddPOIToRoute && (
            <button
              type="button"
              disabled={isInRoute}
              onClick={() => onAddPOIToRoute(poi)}
              className={`mt-1 px-2.5 py-1 rounded text-xs font-medium ${
                isInRoute
                  ? "bg-emerald-600 text-white cursor-default"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {isInRoute ? "Added to Route" : "Add to Route"}
            </button>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
}

function BoundsController({
  routeResult,
  selectedRouteId,
  focusPoint,
  livePosition,
  followLive,
  onUserDrag,
}: {
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  focusPoint?: { lat: number; lng: number } | null;
  livePosition?: { lat: number; lng: number } | null;
  followLive: boolean;
  onUserDrag: () => void;
}) {
  const map = useMap();

  useMapEvents({
    dragstart() {
      onUserDrag();
    },
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);
    return () => window.clearTimeout(t);
  }, [map]);

  useEffect(() => {
    if (!routeResult || followLive) return;
    const active =
      routeResult.alternatives.find((a) => a.routeId === selectedRouteId) ||
      routeResult.alternatives[0];
    if (!active || active.geometry.length < 2) return;
    const bounds = L.latLngBounds(active.geometry as [number, number][]);
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 16 });
  }, [map, routeResult, selectedRouteId, followLive]);

  useEffect(() => {
    if (!focusPoint || followLive) return;
    map.flyTo([focusPoint.lat, focusPoint.lng], Math.max(map.getZoom(), 14), {
      duration: 0.65,
    });
  }, [map, focusPoint, followLive]);

  useEffect(() => {
    if (!followLive || !livePosition) return;
    map.setView([livePosition.lat, livePosition.lng], Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.35,
    });
  }, [map, followLive, livePosition]);

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

function createDirectionalVehicleIcon(headingDeg: number, isPreview: boolean): L.DivIcon {
  const fill = isPreview ? "#7c3aed" : "#2563eb";
  const ring = isPreview ? "rgba(124,58,237,0.22)" : "rgba(37,99,235,0.22)";
  return L.divIcon({
    className: "smartroutes-live-vehicle-icon",
    html: `<div style="width:32px;height:32px;border-radius:9999px;background:${ring};display:flex;align-items:center;justify-content:center;">
      <div style="transform:rotate(${Math.round(headingDeg)}deg);width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path d="M12 2L20 20L12 16L4 20Z" fill="${fill}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
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
  destination,
  waypoints = [],
  discoveredPOIs,
  selectedPOI,
  onSelectPOI,
  onAddPOIToRoute,
  communityReports,
  liveNavigation,
  liveTraffic,
  theme,
  mapPickMode,
  onMapClick,
  focusPoint,
}: MobilityMap2DProps) {
  const [followLive, setFollowLive] = useState(true);

  const isNavActive = Boolean(liveNavigation?.isNavigating);
  useEffect(() => {
    if (isNavActive) {
      setFollowLive(true);
    }
  }, [isNavActive]);

  const defaultCenter: [number, number] = useMemo(() => {
    if (liveNavigation?.currentPosition) {
      return [liveNavigation.currentPosition.lat, liveNavigation.currentPosition.lng];
    }
    if (routeResult) {
      return [routeResult.origin.lat, routeResult.origin.lng];
    }
    if (destination) {
      return [destination.lat, destination.lng];
    }
    return [40.7484, -73.9857];
  }, [liveNavigation, routeResult, destination]);

  const cartoApiKey = (
    import.meta.env.VITE_CARTO_API_KEY as string | undefined
  )?.trim();

  const tileUrl = cartoApiKey
    ? theme === "dark"
      ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoApiKey)}`
      : `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoApiKey)}`
    : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  const tileAttribution = cartoApiKey
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const isEmergency = Boolean(routeResult?.isEmergency);
  const displayedWaypoints = routeResult ? routeResult.waypoints : waypoints;
  const livePos = liveNavigation?.currentPosition || null;

  const vehicleIcon = useMemo(() => {
    if (!livePos) return null;
    return createDirectionalVehicleIcon(
      livePos.heading ?? 0,
      livePos.source === "preview_simulation",
    );
  }, [livePos]);

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
        <TileLayer
          key={`${theme}-${cartoApiKey ? "carto" : "osm"}`}
          url={tileUrl}
          attribution={tileAttribution}
        />
        <BoundsController
          routeResult={routeResult}
          selectedRouteId={selectedRouteId}
          focusPoint={focusPoint}
          livePosition={livePos ? { lat: livePos.lat, lng: livePos.lng } : null}
          followLive={Boolean(isNavActive && followLive)}
          onUserDrag={() => {
            if (isNavActive) setFollowLive(false);
          }}
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
        {displayedWaypoints.map((wp, idx) => (
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
              <div className="text-xs space-y-0.5 max-w-[220px]">
                <p className="font-semibold">
                  Stop {idx + 1}: {wp.label || wp.address}
                </p>
                {wp.category && (
                  <p className="text-slate-500 capitalize">Category: {wp.category}</p>
                )}
                <p>{wp.address}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  {wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Destination Marker (from active route or selected destination) */}
        {(routeResult?.destination || destination) && (
          <CircleMarker
            center={[
              (routeResult?.destination || destination)!.lat,
              (routeResult?.destination || destination)!.lng,
            ]}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: isEmergency ? "#dc2626" : "#1d4ed8",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="text-xs space-y-0.5">
                <p className="font-semibold">
                  {isEmergency
                    ? "Emergency Destination"
                    : `Destination: ${(routeResult?.destination || destination)!.label || "Selected"}`}
                </p>
                <p>{(routeResult?.destination || destination)!.address}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  {(routeResult?.destination || destination)!.lat.toFixed(5)},{" "}
                  {(routeResult?.destination || destination)!.lng.toFixed(5)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* Discovered POIs */}
        {discoveredPOIs.map((poi) => (
          <POIMarker
            key={poi.id}
            poi={poi}
            isSelected={selectedPOI?.id === poi.id}
            isInRoute={isPoiAlreadyInWaypoints(poi, displayedWaypoints)}
            onSelectPOI={onSelectPOI}
            onAddPOIToRoute={onAddPOIToRoute}
          />
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

        {/* Verified Live Traffic Incidents (TomTom only when configured) */}
        {liveTraffic?.available &&
          liveTraffic.incidents.map((inc) => (
            <CircleMarker
              key={inc.id}
              center={[inc.lat, inc.lng]}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor:
                  inc.severity === "high"
                    ? "#dc2626"
                    : inc.severity === "moderate"
                      ? "#ea580c"
                      : "#f59e0b",
                fillOpacity: 0.95,
              }}
            >
              <Popup>
                <div className="text-xs space-y-0.5 max-w-[210px]">
                  <p className="font-semibold text-red-700">{inc.category}</p>
                  <p>{inc.description}</p>
                  {inc.delayMinutes !== undefined && (
                    <p className="text-slate-600">Delay: +{inc.delayMinutes} min</p>
                  )}
                  <p className="text-[10px] text-slate-400">
                    Source: {liveTraffic.provider}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {/* Live GPS / Preview Directional Vehicle Marker & Accuracy Circle */}
        {livePos && livePos.source === "gps" && livePos.accuracyM && (
          <Circle
            center={[livePos.lat, livePos.lng]}
            radius={Math.min(livePos.accuracyM, 150)}
            pathOptions={{
              color: "#2563eb",
              weight: 1,
              fillColor: "#3b82f6",
              fillOpacity: 0.14,
            }}
          />
        )}
        {livePos && vehicleIcon && (
          <Marker position={[livePos.lat, livePos.lng]} icon={vehicleIcon} zIndexOffset={1000}>
            <Popup>
              <div className="text-xs space-y-0.5">
                <p className="font-semibold">
                  {livePos.source === "gps"
                    ? "Live GPS Position"
                    : "Simulated Route Preview (Demo)"}
                </p>
                <p className="font-mono text-[11px] text-slate-600">
                  {livePos.lat.toFixed(5)}, {livePos.lng.toFixed(5)}
                </p>
                {livePos.speedKmh !== null && (
                  <p className="text-slate-600">Speed: {livePos.speedKmh} km/h</p>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Recenter button when user manually pans away during active navigation */}
      {isNavActive && !followLive && livePos && (
        <button
          type="button"
          onClick={() => setFollowLive(true)}
          className="absolute bottom-4 right-4 z-[450] px-3 py-1.5 rounded-lg bg-slate-900/95 text-white border border-slate-700 text-xs font-medium shadow-lg hover:bg-slate-800"
        >
          Recenter on Vehicle
        </button>
      )}
    </div>
  );
}
