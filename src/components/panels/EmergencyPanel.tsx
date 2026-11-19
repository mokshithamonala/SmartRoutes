import { useState } from "react";
import {
  AlertOctagon,
  Building2,
  Copy,
  Loader2,
  Navigation,
  Phone,
  Shield,
  Siren,
} from "lucide-react";
import { toast } from "sonner";
import type {
  DiscoveredPOI,
  PredictiveRouteResult,
  UserPreferencesRecord,
} from "../../types/mobility";
import { EmergencyAlerts } from "../EmergencyAlerts";

interface EmergencyPanelProps {
  emergencyPOIs: DiscoveredPOI[];
  isSearching: boolean;
  activeEmergencyRoute: PredictiveRouteResult | null;
  preferences: UserPreferencesRecord | null;
  currentCoords: { lat: number; lng: number } | null;
  onDiscoverEmergency: (category: "hospital" | "police" | "emergency") => void;
  onRouteToFacility: (poi: DiscoveredPOI) => void;
}

export function EmergencyPanel({
  emergencyPOIs,
  isSearching,
  activeEmergencyRoute,
  preferences,
  currentCoords,
  onDiscoverEmergency,
  onRouteToFacility,
}: EmergencyPanelProps) {
  const [locationShareConsent, setLocationShareConsent] = useState(false);
  const [showDemoCorridor, setShowDemoCorridor] = useState(false);

  const handleCopyLocation = async () => {
    if (!locationShareConsent) {
      toast.error("Enable explicit location sharing consent first.");
      return;
    }
    const coords = currentCoords || { lat: 40.758, lng: -73.9855 };
    const text = `Emergency location share: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (https://www.openstreetmap.org/?mlat=${coords.lat.toFixed(5)}&mlon=${coords.lng.toFixed(5)}#map=16/${coords.lat.toFixed(5)}/${coords.lng.toFixed(5)})`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Location coordinates copied to clipboard.");
    } catch {
      toast.info(text);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Emergency Assistance
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Discover real nearby hospitals and emergency facilities and compute OSRM routes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDemoCorridor((v) => !v)}
          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          {showDemoCorridor ? "Emergency Routing" : "Demo Corridor Alerts"}
        </button>
      </div>

      {/* Mandatory Safety & Decision-Support Disclaimer */}
      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-300 space-y-1">
        <p className="font-semibold flex items-center gap-1.5">
          <AlertOctagon className="w-4 h-4 shrink-0" />
          Decision-Support Only
        </p>
        <p className="leading-relaxed">
          SmartRoutes does not dispatch emergency services, contact authorities, or control real traffic signals. In life-threatening emergencies, call local emergency services (e.g., 911 / 112) immediately.
        </p>
      </div>

      {showDemoCorridor ? (
        <div className="space-y-2">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Simulated demonstration module — green corridor notifications are local demo alerts only.
          </p>
          <EmergencyAlerts />
        </div>
      ) : (
        <>
          {/* One-Click Real Emergency Discovery */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onDiscoverEmergency("hospital")}
              disabled={isSearching}
              className="py-2.5 px-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium flex flex-col items-center gap-1"
            >
              <Building2 className="w-4 h-4" />
              Hospitals
            </button>
            <button
              type="button"
              onClick={() => onDiscoverEmergency("police")}
              disabled={isSearching}
              className="py-2.5 px-2 rounded-lg bg-slate-900 dark:bg-slate-100 hover:opacity-90 disabled:opacity-50 text-white dark:text-slate-900 text-xs font-medium flex flex-col items-center gap-1"
            >
              <Shield className="w-4 h-4" />
              Police
            </button>
            <button
              type="button"
              onClick={() => onDiscoverEmergency("emergency")}
              disabled={isSearching}
              className="py-2.5 px-2 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 text-xs font-medium flex flex-col items-center gap-1"
            >
              <Siren className="w-4 h-4" />
              All Services
            </button>
          </div>

          {/* Active Emergency Route Summary */}
          {activeEmergencyRoute?.isEmergency && activeEmergencyRoute.alternatives[0] && (
            <div className="p-3 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 space-y-1.5">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                Active Emergency Route: {activeEmergencyRoute.destination.label || activeEmergencyRoute.destination.address}
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {activeEmergencyRoute.alternatives[0].distanceKm} km · ~
                {activeEmergencyRoute.alternatives[0].durationMin} min (OSRM est.) ·{" "}
                {activeEmergencyRoute.alternatives.length} route option(s)
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Synchronized on 2D OpenStreetMap and 3D Urban Digital Twin.
              </p>
            </div>
          )}

          {/* Configured Personal Emergency Contact & Consent Location Share */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                Emergency Contact
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {preferences?.emergencyContactName
                  ? `${preferences.emergencyContactName} (${preferences.emergencyContactPhone || "No number"})`
                  : "Configure in Insights"}
              </span>
            </div>

            <label className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={locationShareConsent}
                onChange={(e) => setLocationShareConsent(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-red-600"
              />
              I explicitly consent to copy my current coordinates for sharing with my emergency contact.
            </label>

            <button
              type="button"
              onClick={() => void handleCopyLocation()}
              disabled={!locationShareConsent}
              className="w-full py-1.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-45 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Location Share Link
            </button>
          </div>

          {/* Real Discovered Emergency Facilities */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              Nearby Emergency Facilities ({emergencyPOIs.length})
            </h3>
            {isSearching ? (
              <div className="flex items-center justify-center py-6 text-xs text-slate-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching OpenStreetMap emergency services...
              </div>
            ) : emergencyPOIs.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                Select Hospitals, Police, or All Services above to discover real nearby facilities.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {emergencyPOIs.map((poi) => (
                  <div
                    key={poi.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {poi.name}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        <span className="capitalize">{poi.category}</span> ·{" "}
                        <span className="font-mono tabular-nums">{poi.distanceKm} km</span> ·{" "}
                        {poi.address}
                      </p>
                      {poi.phone && (
                        <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                          Tel: {poi.phone}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRouteToFacility(poi)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1 shrink-0"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Route
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
