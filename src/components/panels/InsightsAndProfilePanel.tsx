import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bookmark, Save, Star, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import type {
  CommunityReport,
  FavouriteDestination,
  GeoPoint,
  SavedJourneyRecord,
  UserPreferencesRecord,
} from "../../types/mobility";
import { LocationSearchInput } from "./LocationSearchInput";

interface InsightsAndProfilePanelProps {
  savedJourneys: SavedJourneyRecord[];
  communityReports: CommunityReport[];
  favourites: FavouriteDestination[];
  preferences: UserPreferencesRecord | null;
  onSavePreferences: (prefs: UserPreferencesRecord) => Promise<void>;
  onAddFavourite: (fav: {
    label: string;
    address: string;
    lat: number;
    lng: number;
    category: FavouriteDestination["category"];
  }) => Promise<void>;
  onRemoveFavourite: (id: string) => Promise<void>;
  onUseFavouriteAsDestination: (fav: FavouriteDestination) => void;
  onDeleteAllPersonalData: () => Promise<void>;
}

const DEFAULT_PREFS: UserPreferencesRecord = {
  preferredRouteType: "fastest",
  avoidTolls: false,
  avoidHighways: false,
  vehicleType: "car",
  notificationsEnabled: true,
  parkingPreference: "closest",
  accessibilityNeeds: false,
  emergencyContactName: "",
  emergencyContactPhone: "",
};

export function InsightsAndProfilePanel(props: InsightsAndProfilePanelProps) {
  const [form, setForm] = useState<UserPreferencesRecord>(
    props.preferences || DEFAULT_PREFS,
  );
  const [favPoint, setFavPoint] = useState<GeoPoint | null>(null);
  const [favLabel, setFavLabel] = useState("");
  const [favCategory, setFavCategory] =
    useState<FavouriteDestination["category"]>("frequent");
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (props.preferences) {
      setForm({ ...DEFAULT_PREFS, ...props.preferences });
    }
  }, [props.preferences]);

  const analytics = useMemo(() => {
    const journeys = props.savedJourneys;
    const totalKm = journeys.reduce((s, j) => s + j.distanceKm, 0);
    const totalMin = journeys.reduce((s, j) => s + j.durationMin, 0);
    const avgScore =
      journeys.length > 0
        ? Math.round(
            journeys.reduce((s, j) => s + j.qualityScore, 0) / journeys.length,
          )
        : 0;
    const chartData = journeys
      .slice(0, 8)
      .reverse()
      .map((j, idx) => ({
        name: j.name.length > 12 ? `${j.name.slice(0, 12)}…` : j.name || `Trip ${idx + 1}`,
        distanceKm: Number(j.distanceKm.toFixed(1)),
        durationMin: j.durationMin,
      }));
    return { totalKm: totalKm.toFixed(1), totalMin, avgScore, chartData };
  }, [props.savedJourneys]);

  const handleSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    try {
      await props.onSavePreferences(form);
      toast.success("Personal preferences saved.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleAddFav = async () => {
    if (!favPoint || !favLabel.trim()) {
      toast.error("Search a location and provide a label.");
      return;
    }
    await props.onAddFavourite({
      label: favLabel.trim(),
      address: favPoint.address,
      lat: favPoint.lat,
      lng: favPoint.lng,
      category: favCategory,
    });
    setFavLabel("");
    setFavPoint(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Journey Analytics &amp; Personalization
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Metrics computed strictly from your stored journeys and saved preferences.
        </p>
      </div>

      {/* Grounded Stored Analytics KPI Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
            Saved Trips
          </span>
          <span className="font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-white">
            {props.savedJourneys.length}
          </span>
        </div>
        <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
            Total Distance
          </span>
          <span className="font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-white">
            {analytics.totalKm} km
          </span>
        </div>
        <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
            Avg Score
          </span>
          <span className="font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-white">
            {props.savedJourneys.length > 0 ? `${analytics.avgScore}/100` : "—"}
          </span>
        </div>
      </div>

      {/* Real Data Chart */}
      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
        <h3 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">
          Saved Journey Distance &amp; Est. Duration
        </h3>
        {analytics.chartData.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
            Save at least one calculated route in the Planner tab to visualize historical journey metrics here.
          </p>
        ) : (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    fontSize: "12px",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="distanceKm" name="Distance (km)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="durationMin" name="Est. Time (min)" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          Active community reports in workspace: <span className="font-mono">{props.communityReports.length}</span>
        </p>
      </div>

      {/* Favourite Destinations Manager */}
      <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3">
        <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-500" />
          Favourite Destinations ({props.favourites.length})
        </h3>

        <LocationSearchInput
          label="Search location to save"
          placeholder="Search address or place..."
          value={favPoint}
          onChange={setFavPoint}
        />

        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            value={favLabel}
            onChange={(e) => setFavLabel(e.target.value)}
            placeholder="Label (e.g., Office)"
            className="col-span-2 px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
          <select
            value={favCategory}
            onChange={(e) =>
              setFavCategory(e.target.value as FavouriteDestination["category"])
            }
            className="px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="home">Home</option>
            <option value="work">Work</option>
            <option value="frequent">Frequent</option>
            <option value="parking">Parking</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void handleAddFav()}
          disabled={!favPoint || !favLabel.trim()}
          className="w-full py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 disabled:opacity-45 text-xs font-medium flex items-center justify-center gap-1.5"
        >
          <Bookmark className="w-3.5 h-3.5" />
          Save Favourite Destination
        </button>

        {props.favourites.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {props.favourites.map((fav) => (
              <div
                key={fav._id}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-xs"
              >
                <button
                  type="button"
                  onClick={() => props.onUseFavouriteAsDestination(fav)}
                  className="text-left min-w-0 flex-1"
                >
                  <p className="font-medium text-slate-900 dark:text-white truncate">
                    {fav.label} <span className="text-slate-400 font-normal">· {fav.category}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {fav.address}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void props.onRemoveFavourite(fav._id)}
                  aria-label="Remove favourite"
                  className="text-slate-400 hover:text-red-500 p-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Driver Preferences Form */}
      <form
        onSubmit={handleSavePrefs}
        className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3"
      >
        <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
          Personal Driving Preferences
        </h3>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Default Route Mode
            </label>
            <select
              value={form.preferredRouteType}
              onChange={(e) =>
                setForm({
                  ...form,
                  preferredRouteType: e.target.value as UserPreferencesRecord["preferredRouteType"],
                })
              }
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="fastest">Fastest Estimate</option>
              <option value="shortest">Shortest Distance</option>
              <option value="balanced">Lowest Turn Complexity</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Vehicle Type
            </label>
            <select
              value={form.vehicleType}
              onChange={(e) =>
                setForm({
                  ...form,
                  vehicleType: e.target.value as UserPreferencesRecord["vehicleType"],
                })
              }
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="car">Car</option>
              <option value="ev">Electric Vehicle</option>
              <option value="bike">Motorcycle</option>
              <option value="truck">Light Truck</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Parking Priority
            </label>
            <select
              value={form.parkingPreference}
              onChange={(e) =>
                setForm({
                  ...form,
                  parkingPreference: e.target.value as UserPreferencesRecord["parkingPreference"],
                })
              }
              className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="closest">Closest to destination</option>
              <option value="ev_charging">EV charging available</option>
              <option value="accessible">Wheelchair accessible</option>
              <option value="covered">Covered garage</option>
            </select>
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.accessibilityNeeds}
                onChange={(e) =>
                  setForm({ ...form, accessibilityNeeds: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-600"
              />
              Accessibility priority
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <input
            type="text"
            value={form.emergencyContactName}
            onChange={(e) =>
              setForm({ ...form, emergencyContactName: e.target.value })
            }
            placeholder="Emergency contact name"
            className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
          <input
            type="tel"
            value={form.emergencyContactPhone}
            onChange={(e) =>
              setForm({ ...form, emergencyContactPhone: e.target.value })
            }
            placeholder="Emergency phone"
            className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => void props.onDeleteAllPersonalData()}
            className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium"
          >
            Delete all my personal data
          </button>
          <button
            type="submit"
            disabled={savingPrefs}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {savingPrefs ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </form>
    </div>
  );
}
