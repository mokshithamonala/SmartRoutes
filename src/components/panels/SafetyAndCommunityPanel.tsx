import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Flag,
  MapPin,
  ShieldAlert,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CommunityReport,
  GeoPoint,
  WeatherSnapshot,
} from "../../types/mobility";
import { LiveTrafficMap } from "../LiveTrafficMap";

interface SafetyAndCommunityPanelProps {
  reports: CommunityReport[];
  currentUserId: string | null;
  selectedReportLocation: GeoPoint | null;
  weather: WeatherSnapshot | null;
  onRequestMapPickForReport: () => void;
  onSubmitReport: (payload: {
    type: CommunityReport["type"];
    lat: number;
    lng: number;
    address: string;
    description: string;
    severity: CommunityReport["severity"];
    ttlHours: number;
  }) => Promise<void>;
  onConfirmReport: (id: string) => Promise<void>;
  onFlagReport: (id: string) => Promise<void>;
  onResolveReport: (id: string) => Promise<void>;
  onFocusPoint: (lat: number, lng: number) => void;
}

const REPORT_TYPES: Array<{ id: CommunityReport["type"]; label: string }> = [
  { id: "hazard", label: "Road Hazard" },
  { id: "accident", label: "Accident" },
  { id: "closure", label: "Road Closure" },
  { id: "construction", label: "Construction" },
  { id: "obstruction", label: "Obstruction" },
  { id: "parking_update", label: "Parking Update" },
  { id: "advisory", label: "Journey Advisory" },
];

export function SafetyAndCommunityPanel(props: SafetyAndCommunityPanelProps) {
  const [type, setType] = useState<CommunityReport["type"]>("hazard");
  const [severity, setSeverity] = useState<CommunityReport["severity"]>("moderate");
  const [description, setDescription] = useState("");
  const [ttlHours, setTtlHours] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [showDemoCameras, setShowDemoCameras] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!props.selectedReportLocation) {
      toast.error("Select coordinates on the 2D map before submitting a report.");
      return;
    }
    if (description.trim().length < 4) {
      toast.error("Enter a brief description (at least 4 characters).");
      return;
    }
    setSubmitting(true);
    try {
      await props.onSubmitReport({
        type,
        lat: props.selectedReportLocation.lat,
        lng: props.selectedReportLocation.lng,
        address: props.selectedReportLocation.address,
        description: description.trim(),
        severity,
        ttlHours,
      });
      setDescription("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Safety &amp; Community Intelligence
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Community-submitted road reports and verified Open-Meteo weather advisories.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDemoCameras((v) => !v)}
          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          {showDemoCameras ? "Community Reports" : "Demo Traffic Feed"}
        </button>
      </div>

      {showDemoCameras ? (
        <div className="space-y-3">
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
            Simulated / Demonstration Data: Camera feeds and congestion gauges below are sample data preserved from the original prototype, not verified live traffic sensors.
          </div>
          <LiveTrafficMap />
        </div>
      ) : (
        <>
          {/* Verified Weather Advisory Box */}
          {props.weather?.available && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Environmental Context (Verified)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {props.weather.provider}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                {props.weather.conditionLabel} · {props.weather.temperatureC}°C · Rain{" "}
                {props.weather.precipitationMm ?? 0} mm · Wind {props.weather.windSpeedKmh} km/h
              </p>
              {props.weather.severeWarning && (
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5 pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {props.weather.severeWarning}
                </p>
              )}
            </div>
          )}

          {/* Submit Community Road Report Form */}
          <form
            onSubmit={handleSubmit}
            className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                Submit Community Road Report
              </h3>
              <button
                type="button"
                onClick={props.onRequestMapPickForReport}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
              >
                <Crosshair className="w-3.5 h-3.5" />
                Pick on 2D Map
              </button>
            </div>

            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                {props.selectedReportLocation
                  ? `${props.selectedReportLocation.address} (${props.selectedReportLocation.lat.toFixed(4)}, ${props.selectedReportLocation.lng.toFixed(4)})`
                  : "Click 'Pick on 2D Map' to choose incident location"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CommunityReport["type"])}
                className="col-span-2 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                {REPORT_TYPES.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.label}
                  </option>
                ))}
              </select>

              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as CommunityReport["severity"])}
                className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </div>

            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the hazard, lane closure, or obstruction..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />

            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                Expires in:
                <select
                  value={ttlHours}
                  onChange={(e) => setTtlHours(Number(e.target.value))}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[11px]"
                >
                  <option value={2}>2h</option>
                  <option value={6}>6h</option>
                  <option value={24}>24h</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={submitting || !props.selectedReportLocation}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium"
              >
                {submitting ? "Submitting..." : "Publish Report"}
              </button>
            </div>
          </form>

          {/* Active Community Reports Feed */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
              Active Community Reports ({props.reports.length})
            </h3>

            {props.reports.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                No active community road reports. Submit one above to alert other drivers in real time.
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
                {props.reports.map((rep) => {
                  const isOwner = props.currentUserId && rep.createdBy === props.currentUserId;
                  return (
                    <div
                      key={rep._id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => props.onFocusPoint(rep.lat, rep.lng)}
                          className="text-left min-w-0"
                        >
                          <p className="text-xs font-semibold text-slate-900 dark:text-white capitalize">
                            {rep.type.replace("_", " ")} ·{" "}
                            <span
                              className={
                                rep.severity === "high"
                                  ? "text-red-600 dark:text-red-400"
                                  : rep.severity === "moderate"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-slate-500"
                              }
                            >
                              {rep.severity} severity
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {rep.address}
                          </p>
                        </button>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                          {rep.verificationStatus}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        {rep.description}
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          Community report · {new Date(rep.createdAt).toLocaleTimeString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void props.onConfirmReport(rep._id)}
                            className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400"
                          >
                            <ThumbsUp className="w-3 h-3" />
                            Confirm ({rep.confirmations})
                          </button>
                          <button
                            type="button"
                            onClick={() => void props.onFlagReport(rep._id)}
                            className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400"
                          >
                            <Flag className="w-3 h-3" />
                            Flag
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => void props.onResolveReport(rep._id)}
                              className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
