import { useState } from "react";
import {
  Coffee,
  Fuel,
  Loader2,
  MapPin,
  ParkingSquare,
  Plus,
  Search,
  Utensils,
  Wrench,
  Zap,
} from "lucide-react";
import type { DiscoveredPOI, PredictiveRouteResult } from "../../types/mobility";
import { SmartParkingSystem } from "../SmartParkingSystem";

interface StopsAndParkingPanelProps {
  routeResult: PredictiveRouteResult | null;
  discoveredPOIs: DiscoveredPOI[];
  isSearchingPOIs: boolean;
  onDiscoverPOIs: (category: string, anchor: "destination" | "midpoint" | "origin") => void;
  onAddStopToJourney: (poi: DiscoveredPOI) => void;
  onFocusPoint: (lat: number, lng: number) => void;
}

const CATEGORIES = [
  { id: "parking", label: "Parking", icon: ParkingSquare },
  { id: "charging", label: "EV Charge", icon: Zap },
  { id: "fuel", label: "Fuel", icon: Fuel },
  { id: "rest", label: "Rest Stop", icon: Coffee },
  { id: "food", label: "Food", icon: Utensils },
  { id: "service", label: "Service", icon: Wrench },
] as const;

export function StopsAndParkingPanel({
  routeResult,
  discoveredPOIs,
  isSearchingPOIs,
  onDiscoverPOIs,
  onAddStopToJourney,
  onFocusPoint,
}: StopsAndParkingPanelProps) {
  const [category, setCategory] = useState<string>("parking");
  const [anchor, setAnchor] = useState<"destination" | "midpoint" | "origin">("destination");
  const [filterText, setFilterText] = useState("");
  const [showDemoBooking, setShowDemoBooking] = useState(false);

  const filtered = discoveredPOIs.filter((p) => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Parking &amp; Journey Stops
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Discover real OpenStreetMap stops and integrate them into your active route.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDemoBooking((v) => !v)}
          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          {showDemoBooking ? "Back to OSM Stops" : "Demo Slot Booking"}
        </button>
      </div>

      {showDemoBooking ? (
        <div className="space-y-3">
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
            Demonstration Data: The preserved slot reservation module below uses sample demo parking lots for booking workflow testing.
          </div>
          <SmartParkingSystem />
        </div>
      ) : (
        <>
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
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                      : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Search Anchor */}
          <div className="flex items-center gap-2">
            <select
              value={anchor}
              onChange={(e) => setAnchor(e.target.value as any)}
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="destination">
                Near Destination {routeResult ? `(${routeResult.destination.label || "Active"})` : "(Default area)"}
              </option>
              <option value="midpoint" disabled={!routeResult}>
                Along Route Midpoint
              </option>
              <option value="origin" disabled={!routeResult}>
                Near Origin
              </option>
            </select>

            <button
              type="button"
              onClick={() => onDiscoverPOIs(category, anchor)}
              disabled={isSearchingPOIs}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
            >
              {isSearchingPOIs ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              Search OSM
            </button>
          </div>

          {/* Honesty Notice */}
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Occupancy transparency: OpenStreetMap does not provide live parking sensors; real-time slot availability is explicitly reported as unknown.
          </p>

          {/* Local Filter */}
          {discoveredPOIs.length > 0 && (
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter discovered stops by name or street..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          )}

          {/* Results List */}
          {isSearchingPOIs ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800/70 animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              Select a category and click <strong>Search OSM</strong> to find real nearby parking, EV chargers, fuel, or rest stops.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-0.5">
              {filtered.map((poi) => (
                <div
                  key={poi.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onFocusPoint(poi.lat, poi.lng)}
                      className="text-left min-w-0 flex-1"
                    >
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate hover:text-blue-600 dark:hover:text-blue-400">
                        {poi.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {poi.address}
                      </p>
                    </button>
                    <span className="font-mono tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300 shrink-0">
                      {poi.distanceKm} km
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className="capitalize">{poi.category}</span>
                    <span>·</span>
                    <span>Availability: {poi.availabilityStatus}</span>
                    {poi.accessibility && (
                      <>
                        <span>·</span>
                        <span>{poi.accessibility}</span>
                      </>
                    )}
                    {poi.capacity && (
                      <>
                        <span>·</span>
                        <span>Capacity: {poi.capacity}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400">{poi.source}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onFocusPoint(poi.lat, poi.lng)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
                      >
                        <MapPin className="w-3 h-3" />
                        Locate
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddStopToJourney(poi)}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add to Route
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
