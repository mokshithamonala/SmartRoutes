import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Coffee,
  Compass,
  ExternalLink,
  Fuel,
  Globe,
  Loader2,
  MapPin,
  ParkingSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Utensils,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type {
  DiscoveredPOI,
  FavouriteDestination,
  GeoPoint,
  JourneyStop,
  PredictiveRouteResult,
} from "../../types/mobility";
import { LocationSearchInput } from "./LocationSearchInput";

export interface POISearchMeta {
  category: string;
  anchor: "destination" | "midpoint" | "origin";
  radiusMeters: number;
  referenceLabel: string;
  referenceLat: number;
  referenceLng: number;
}

interface StopsAndParkingPanelProps {
  origin: GeoPoint | null;
  destination: GeoPoint | null;
  waypoints: JourneyStop[];
  favourites: FavouriteDestination[];
  routeResult: PredictiveRouteResult | null;
  discoveredPOIs: DiscoveredPOI[];
  selectedPOI: DiscoveredPOI | null;
  isSearchingPOIs: boolean;
  poiSearchError: string | null;
  poiSearchMeta: POISearchMeta | null;
  onChangeDestination: (pt: GeoPoint | null) => void;
  onDiscoverPOIs: (
    category: string,
    anchor: "destination" | "midpoint" | "origin",
    radiusMeters: number,
  ) => void;
  onSelectPOI: (poi: DiscoveredPOI | null) => void;
  onAddStopToJourney: (poi: DiscoveredPOI) => void;
  onFocusPoint: (lat: number, lng: number) => void;
  onRequestMapPickDestination: () => void;
  onUseCurrentLocation: () => void;
}

const CATEGORIES = [
  { id: "parking", label: "Parking", icon: ParkingSquare },
  { id: "charging", label: "EV Charge", icon: Zap },
  { id: "fuel", label: "Fuel / Petrol", icon: Fuel },
  { id: "rest", label: "Rest Stop", icon: Coffee },
  { id: "food", label: "Food", icon: Utensils },
  { id: "service", label: "Repair / Service", icon: Wrench },
] as const;

const RADIUS_OPTIONS = [
  { meters: 2000, label: "2 km" },
  { meters: 5000, label: "5 km" },
  { meters: 10000, label: "10 km" },
  { meters: 15000, label: "15 km" },
];

function categoryDisplayName(cat: string): string {
  switch (cat) {
    case "parking":
      return "Parking Area";
    case "charging":
      return "EV Charging Station";
    case "fuel":
      return "Fuel / Petrol Station";
    case "rest":
      return "Rest Stop";
    case "food":
      return "Food / Restaurant";
    case "service":
      return "Repair / Service Shop";
    case "hospital":
      return "Hospital / Clinic";
    case "police":
      return "Police Station";
    case "fire":
      return "Fire Station";
    default:
      return cat;
  }
}

function isStopAdded(poi: DiscoveredPOI, waypoints: JourneyStop[]): boolean {
  return waypoints.some((w) => {
    if (w.sourcePoiId && w.sourcePoiId === poi.id) return true;
    const dLat = Math.abs(w.lat - poi.lat);
    const dLng = Math.abs(w.lng - poi.lng);
    return dLat < 0.00045 && dLng < 0.00045;
  });
}

export function StopsAndParkingPanel({
  origin,
  destination,
  waypoints,
  favourites,
  routeResult,
  discoveredPOIs,
  selectedPOI,
  isSearchingPOIs,
  poiSearchError,
  poiSearchMeta,
  onChangeDestination,
  onDiscoverPOIs,
  onSelectPOI,
  onAddStopToJourney,
  onFocusPoint,
  onRequestMapPickDestination,
  onUseCurrentLocation,
}: StopsAndParkingPanelProps) {
  const [category, setCategory] = useState<string>("rest");
  const [anchor, setAnchor] = useState<"destination" | "midpoint" | "origin">("destination");
  const [radiusMeters, setRadiusMeters] = useState<number>(5000);
  const [filterText, setFilterText] = useState("");

  const effectiveDest = destination || routeResult?.destination || null;
  const effectiveOrigin = origin || routeResult?.origin || null;

  const hasAnchorTarget = useMemo(() => {
    if (anchor === "destination") return Boolean(effectiveDest);
    if (anchor === "origin") return Boolean(effectiveOrigin);
    if (anchor === "midpoint") return Boolean(routeResult || (effectiveOrigin && effectiveDest));
    return false;
  }, [anchor, effectiveDest, effectiveOrigin, routeResult]);

  // Unique coordinate signature for the active anchor so destination changes immediately trigger a fresh OSM search
  const activeAnchorKey = useMemo(() => {
    if (anchor === "destination" && effectiveDest) {
      return `dest:${effectiveDest.lat.toFixed(4)},${effectiveDest.lng.toFixed(4)}`;
    }
    if (anchor === "origin" && effectiveOrigin) {
      return `orig:${effectiveOrigin.lat.toFixed(4)},${effectiveOrigin.lng.toFixed(4)}`;
    }
    if (anchor === "midpoint") {
      if (routeResult) {
        return `mid:${routeResult.origin.lat.toFixed(3)},${routeResult.origin.lng.toFixed(3)}:${routeResult.destination.lat.toFixed(3)},${routeResult.destination.lng.toFixed(3)}`;
      }
      if (effectiveOrigin && effectiveDest) {
        return `mid:${effectiveOrigin.lat.toFixed(3)},${effectiveOrigin.lng.toFixed(3)}:${effectiveDest.lat.toFixed(3)},${effectiveDest.lng.toFixed(3)}`;
      }
    }
    return "";
  }, [anchor, effectiveDest, effectiveOrigin, routeResult]);

  const lastTriggeredKeyRef = useRef<string>("");

  // Auto-refresh stops whenever destination/anchor, category, or search radius changes
  useEffect(() => {
    if (!activeAnchorKey) return;
    const querySig = `${activeAnchorKey}|${category}|${radiusMeters}`;
    if (lastTriggeredKeyRef.current === querySig) return;
    lastTriggeredKeyRef.current = querySig;
    onDiscoverPOIs(category, anchor, radiusMeters);
  }, [activeAnchorKey, anchor, category, radiusMeters, onDiscoverPOIs]);

  const handleManualSearch = (
    nextCategory = category,
    nextAnchor = anchor,
    nextRadius = radiusMeters,
  ) => {
    lastTriggeredKeyRef.current = `${activeAnchorKey}|${nextCategory}|${nextRadius}`;
    onDiscoverPOIs(nextCategory, nextAnchor, nextRadius);
  };

  const filtered = discoveredPOIs.filter((p) => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  const activeDetailsPOI = useMemo(() => {
    if (!selectedPOI) return null;
    // Always bind to the exact matching record from the current search or selected state
    return discoveredPOIs.find((p) => p.id === selectedPOI.id) || selectedPOI;
  }, [selectedPOI, discoveredPOIs]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Parking &amp; Journey Stops
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Real OpenStreetMap stops filtered strictly around your selected destination or route.
        </p>
      </div>

      {/* Destination / Reference Location Picker */}
      <div className="space-y-1.5">
        <LocationSearchInput
          label="Destination / Search Area"
          placeholder="Search city or destination (e.g., Tirupati)..."
          value={effectiveDest}
          onChange={(pt) => {
            onChangeDestination(pt);
            if (pt) {
              setAnchor("destination");
            }
          }}
          onRequestMapPick={onRequestMapPickDestination}
          onUseCurrentLocation={onUseCurrentLocation}
          favourites={favourites}
        />
        {poiSearchMeta && (
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
            <span className="truncate">
              Searching within{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {(poiSearchMeta.radiusMeters / 1000).toFixed(0)} km
              </strong>{" "}
              of{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {poiSearchMeta.referenceLabel}
              </strong>
            </span>
            <span className="font-mono text-[10px] shrink-0 ml-2">
              {poiSearchMeta.referenceLat.toFixed(4)}, {poiSearchMeta.referenceLng.toFixed(4)}
            </span>
          </div>
        )}
      </div>

      {/* Category Selector */}
      <div className="grid grid-cols-3 gap-1.5">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`flex items-center justify-center gap-1 px-2 py-2 rounded-lg border text-[11px] font-medium transition-colors whitespace-nowrap ${
                active
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                  : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Anchor + Radius + Refresh Controls */}
      <div className="flex items-center gap-1.5">
        <select
          value={anchor}
          onChange={(e) => setAnchor(e.target.value as "destination" | "midpoint" | "origin")}
          aria-label="Search anchor location"
          className="flex-1 min-w-0 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
        >
          <option value="destination">
            Near Destination {effectiveDest ? `(${effectiveDest.label || effectiveDest.address.split(",")[0]})` : "(Not set)"}
          </option>
          <option value="midpoint" disabled={!routeResult && !(effectiveOrigin && effectiveDest)}>
            Along Route Midpoint
          </option>
          <option value="origin" disabled={!effectiveOrigin}>
            Near Origin {effectiveOrigin ? `(${effectiveOrigin.label || effectiveOrigin.address.split(",")[0]})` : ""}
          </option>
        </select>

        <select
          value={radiusMeters}
          onChange={(e) => setRadiusMeters(Number(e.target.value))}
          aria-label="Search radius"
          className="w-20 px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
        >
          {RADIUS_OPTIONS.map((opt) => (
            <option key={opt.meters} value={opt.meters}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => handleManualSearch()}
          disabled={isSearchingPOIs || !hasAnchorTarget}
          className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
        >
          {isSearchingPOIs ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          Search
        </button>
      </div>

      {/* Dedicated Selected Stop Details Panel */}
      {activeDetailsPOI && (
        <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/50 dark:bg-blue-950/30 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-600 text-white">
                  {categoryDisplayName(activeDetailsPOI.category)}
                </span>
                <span className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {activeDetailsPOI.distanceKm.toFixed(2)} km
                  {activeDetailsPOI.referenceLabel
                    ? ` from ${activeDetailsPOI.referenceLabel}`
                    : ""}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-1 break-words">
                {activeDetailsPOI.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onSelectPOI(null)}
              aria-label="Close stop details"
              className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <dl className="grid grid-cols-1 gap-1.5 text-xs">
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Address
                </dt>
                <dd className="text-slate-800 dark:text-slate-200 break-words">
                  {activeDetailsPOI.address || "Not available"}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Compass className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Coordinates (Lat, Lng)
                </dt>
                <dd className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                  {activeDetailsPOI.lat.toFixed(6)}, {activeDetailsPOI.lng.toFixed(6)}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Opening Hours
                </dt>
                <dd className="text-slate-800 dark:text-slate-200">
                  {activeDetailsPOI.openingHours || "Not available"}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Phone className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Contact
                </dt>
                <dd className="text-slate-800 dark:text-slate-200 break-words">
                  {activeDetailsPOI.phone || "Not available"}
                </dd>
              </div>
            </div>

            {activeDetailsPOI.website && (
              <div className="flex items-start gap-2">
                <Globe className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Website
                  </dt>
                  <dd className="truncate">
                    <a
                      href={
                        activeDetailsPOI.website.startsWith("http")
                          ? activeDetailsPOI.website
                          : `https://${activeDetailsPOI.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      {activeDetailsPOI.website}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </dd>
                </div>
              </div>
            )}
          </dl>

          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-blue-200/70 dark:border-blue-800/60">
            <span>Status: {activeDetailsPOI.availabilityStatus}</span>
            {activeDetailsPOI.operator && (
              <>
                <span>·</span>
                <span>Operator: {activeDetailsPOI.operator}</span>
              </>
            )}
            {activeDetailsPOI.capacity && (
              <>
                <span>·</span>
                <span>Capacity: {activeDetailsPOI.capacity}</span>
              </>
            )}
            {activeDetailsPOI.accessibility && (
              <>
                <span>·</span>
                <span>{activeDetailsPOI.accessibility}</span>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              Data Source: {activeDetailsPOI.source}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onSelectPOI(activeDetailsPOI);
                  onFocusPoint(activeDetailsPOI.lat, activeDetailsPOI.lng);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
              >
                <MapPin className="w-3 h-3" />
                Locate
              </button>
              {(() => {
                const alreadyAdded = isStopAdded(activeDetailsPOI, waypoints);
                return (
                  <button
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => onAddStopToJourney(activeDetailsPOI)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 ${
                      alreadyAdded
                        ? "bg-emerald-600 text-white cursor-default"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {alreadyAdded ? (
                      <>
                        <Check className="w-3 h-3" />
                        Added to Route
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3" />
                        Add to Route
                      </>
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Error State with Retry */}
      {poiSearchError && (
        <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{poiSearchError}</p>
          </div>
          {hasAnchorTarget && (
            <button
              type="button"
              onClick={() => handleManualSearch()}
              disabled={isSearchingPOIs}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              Retry OpenStreetMap Search
            </button>
          )}
        </div>
      )}

      {/* Honesty Notice */}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Source transparency: Stops are fetched live from OpenStreetMap Overpass/Nominatim within the chosen radius. Live occupancy sensors are not provided by OSM.
      </p>

      {/* Local Filter */}
      {discoveredPOIs.length > 0 && (
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder={`Filter ${discoveredPOIs.length} discovered stop(s) by name or address...`}
          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
        />
      )}

      {/* Results List */}
      {!hasAnchorTarget ? (
        <div className="p-5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p className="font-medium text-slate-700 dark:text-slate-300">
            Select a destination to discover nearby stops
          </p>
          <p>
            Search a city or landmark above (for example, <strong>Tirupati</strong>) or set a destination in the Planner tab.
          </p>
        </div>
      ) : isSearchingPOIs ? (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800/70 animate-pulse"
            />
          ))}
        </div>
      ) : !poiSearchError && filtered.length === 0 ? (
        <div className="p-5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
          <p>
            No verified OpenStreetMap{" "}
            <strong>{categoryDisplayName(category).toLowerCase()}</strong> places found within{" "}
            <strong>{(radiusMeters / 1000).toFixed(0)} km</strong>
            {poiSearchMeta ? ` of ${poiSearchMeta.referenceLabel}` : ""}.
          </p>
          {radiusMeters < 15000 && (
            <button
              type="button"
              onClick={() => setRadiusMeters(radiusMeters < 10000 ? 10000 : 15000)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium"
            >
              Expand Search Radius to {radiusMeters < 10000 ? "10 km" : "15 km"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
          {filtered.map((poi) => {
            const isSelected = activeDetailsPOI?.id === poi.id;
            const alreadyAdded = isStopAdded(poi, waypoints);
            return (
              <div
                key={poi.id}
                onClick={() => {
                  onSelectPOI(poi);
                  onFocusPoint(poi.lat, poi.lng);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectPOI(poi);
                    onFocusPoint(poi.lat, poi.lng);
                  }
                }}
                className={`p-3 rounded-lg border transition-colors cursor-pointer space-y-1.5 ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/35"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {poi.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {poi.hasAddress
                        ? poi.address
                        : `${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)} (Address not listed in OSM)`}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                    {poi.distanceKm.toFixed(2)} km
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>{categoryDisplayName(poi.category)}</span>
                  {poi.openingHours && (
                    <>
                      <span>·</span>
                      <span className="truncate max-w-[160px]">{poi.openingHours}</span>
                    </>
                  )}
                  {poi.phone && (
                    <>
                      <span>·</span>
                      <span>{poi.phone}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400">{poi.source}</span>
                  <div
                    className="flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPOI(poi);
                        onFocusPoint(poi.lat, poi.lng);
                      }}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      Locate
                    </button>
                    <button
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => onAddStopToJourney(poi)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 ${
                        alreadyAdded
                          ? "bg-emerald-600 text-white cursor-default"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      {alreadyAdded ? (
                        <>
                          <Check className="w-3 h-3" />
                          Added
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          Add to Route
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
