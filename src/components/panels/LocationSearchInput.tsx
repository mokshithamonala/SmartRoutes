import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, LocateFixed, MapPin, Search, Star } from "lucide-react";
import type { FavouriteDestination, GeoPoint } from "../../types/mobility";
import { apiSearchLocations } from "../../services/apiClient";

interface LocationSearchInputProps {
  label: string;
  placeholder: string;
  value: GeoPoint | null;
  onChange: (point: GeoPoint | null) => void;
  onRequestMapPick?: () => void;
  onUseCurrentLocation?: () => void;
  favourites?: FavouriteDestination[];
  near?: { lat: number; lng: number };
}

export function LocationSearchInput({
  label,
  placeholder,
  value,
  onChange,
  onRequestMapPick,
  onUseCurrentLocation,
  favourites = [],
  near,
}: LocationSearchInputProps) {
  const [query, setQuery] = useState(value?.address || "");
  const [results, setResults] = useState<GeoPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value?.address || "");
  }, [value?.address]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const runSearch = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const found = await apiSearchLocations(trimmed, near);
      setResults(found);
      setOpen(true);
    } catch (err: any) {
      setError(err?.message || "Location search unavailable");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (query === value?.address) return;
    const t = window.setTimeout(() => {
      if (query.trim().length >= 3) {
        void runSearch(query);
      }
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {onUseCurrentLocation && (
            <button
              type="button"
              onClick={onUseCurrentLocation}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <LocateFixed className="w-3 h-3" />
              GPS
            </button>
          )}
          {onRequestMapPick && (
            <button
              type="button"
              onClick={onRequestMapPick}
              className="text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
            >
              <Crosshair className="w-3 h-3" />
              Pick on map
            </button>
          )}
        </div>
      </div>

      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) onChange(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch(query);
            }
          }}
          placeholder={placeholder}
          className="w-full pl-3 pr-9 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => void runSearch(query)}
          aria-label={`Search ${label}`}
          className="absolute right-2 p-1 text-slate-500 hover:text-blue-600 dark:text-slate-400"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{error}</p>}

      {open && (results.length > 0 || (favourites.length > 0 && query.trim().length < 2)) && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {results.length === 0 && favourites.length > 0 && (
            <div className="p-1.5">
              <p className="px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Saved Favourites
              </p>
              {favourites.map((fav) => (
                <button
                  key={fav._id}
                  type="button"
                  onClick={() => {
                    const pt: GeoPoint = {
                      lat: fav.lat,
                      lng: fav.lng,
                      address: fav.address,
                      label: fav.label,
                    };
                    onChange(pt);
                    setQuery(fav.address);
                    setOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-start gap-2"
                >
                  <Star className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {fav.label}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {fav.address}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.map((pt, idx) => (
            <button
              key={`${pt.lat}-${pt.lng}-${idx}`}
              type="button"
              onClick={() => {
                onChange(pt);
                setQuery(pt.address);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                  {pt.label || pt.address.split(",")[0]}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {pt.address}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
