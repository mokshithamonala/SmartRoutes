import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Car,
  Compass,
  Lock,
  Moon,
  ParkingSquare,
  ShieldAlert,
  Siren,
  Sparkles,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthSession, useMutation, useQuery } from "../lib/convexAdapter";
import { api } from "../../convex/_generated/api";
import { SignOutButton } from "../SignOutButton";
import { apiGetDriverStatus } from "../services/authClient";
import {
  apiCalculateRoute,
  apiDiscoverPOIs,
  apiFetchTraffic,
  apiFetchUrbanContext,
  apiFetchWeather,
  apiReverseGeocode,
} from "../services/apiClient";
import type {
  CommunityReport,
  CompanionMapAction,
  DiscoveredPOI,
  FavouriteDestination,
  GeoPoint,
  JourneyStop,
  LiveTrafficSnapshot,
  PredictiveRouteResult,
  RoutePreferences,
  SavedJourneyRecord,
  UrbanContextData,
  UserPreferencesRecord,
  WeatherSnapshot,
} from "../types/mobility";
import { useLiveNavigation } from "../hooks/useLiveNavigation";
import { MapViewport, type MapViewMode } from "./map/MapViewport";
import { RoutePlannerPanel } from "./panels/RoutePlannerPanel";
import { StopsAndParkingPanel, type POISearchMeta } from "./panels/StopsAndParkingPanel";
import { SafetyAndCommunityPanel } from "./panels/SafetyAndCommunityPanel";
import { EmergencyPanel } from "./panels/EmergencyPanel";
import { InsightsAndProfilePanel } from "./panels/InsightsAndProfilePanel";
import { DrivingCompanionDrawer } from "./ai/DrivingCompanionDrawer";

interface CommandCenterProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

const DEFAULT_FALLBACK_CENTER = { lat: 40.7549, lng: -73.984 };

function clientHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function CommandCenter({ theme, onToggleTheme }: CommandCenterProps) {
  const navigate = useNavigate();

  // Unified Backend JWT Auth & Driver Role State
  const authSession = useAuthSession();
  const [togglingDriverMode, setTogglingDriverMode] = useState(false);

  // Persistent Queries (workspace store scoped by verified user id)
  const loggedInUser = useQuery(api.auth.loggedInUser);
  const savedJourneys = (useQuery(api.journeys.listUserJourneys) || []) as unknown as SavedJourneyRecord[];
  const communityReports = (useQuery(api.community.listActiveReports) || []) as unknown as CommunityReport[];
  const savedPreferences = useQuery(api.preferences.getPreferences) as UserPreferencesRecord | null | undefined;
  const favourites = (useQuery(api.preferences.listFavourites) || []) as unknown as FavouriteDestination[];

  // Persistent Mutations
  const initializeParking = useMutation(api.parking.initializeParkingData);
  const saveJourneyMutation = useMutation(api.journeys.saveJourney);
  const updateJourneyStopsMutation = useMutation(api.journeys.updateJourneyStops);
  const deleteJourneyMutation = useMutation(api.journeys.deleteJourney);
  const submitReportMutation = useMutation(api.community.submitReport);
  const confirmReportMutation = useMutation(api.community.confirmReport);
  const flagReportMutation = useMutation(api.community.flagReport);
  const resolveReportMutation = useMutation(api.community.resolveReport);
  const savePreferencesMutation = useMutation(api.preferences.savePreferences);
  const addFavouriteMutation = useMutation(api.preferences.addFavourite);
  const removeFavouriteMutation = useMutation(api.preferences.removeFavourite);
  const deleteAllPersonalDataMutation = useMutation(api.preferences.deleteAllPersonalData);

  // Synchronized Mobility State
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [waypoints, setWaypoints] = useState<JourneyStop[]>([]);
  const [activeSavedJourneyId, setActiveSavedJourneyId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<RoutePreferences>({
    routeType: "fastest",
    avoidTolls: false,
    avoidHighways: false,
    optimizeStopOrder: false,
  });

  const [routeResult, setRouteResult] = useState<PredictiveRouteResult | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);

  const [discoveredPOIs, setDiscoveredPOIs] = useState<DiscoveredPOI[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<DiscoveredPOI | null>(null);
  const [poiSearchError, setPoiSearchError] = useState<string | null>(null);
  const [poiSearchMeta, setPoiSearchMeta] = useState<POISearchMeta | null>(null);
  const [emergencyPOIs, setEmergencyPOIs] = useState<DiscoveredPOI[]>([]);
  const [isSearchingPOIs, setIsSearchingPOIs] = useState(false);
  const [isSearchingEmergency, setIsSearchingEmergency] = useState(false);
  const poiRequestIdRef = useRef(0);

  const [urbanContext, setUrbanContext] = useState<UrbanContextData | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [liveTraffic, setLiveTraffic] = useState<LiveTrafficSnapshot | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Viewport & Interaction State
  const [viewMode, setViewMode] = useState<MapViewMode>("2d");
  const [nightScene3D, setNightScene3D] = useState<boolean>(theme === "dark");
  const [mapPickMode, setMapPickMode] = useState<"none" | "origin" | "destination" | "report">("none");
  const [selectedReportLocation, setSelectedReportLocation] = useState<GeoPoint | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number } | null>(null);

  // AI Driving Companion Drawer State
  const [companionOpen, setCompanionOpen] = useState(false);
  const [pendingAIPrompt, setPendingAIPrompt] = useState<string | null>(null);

  const prefsAppliedRef = useRef(false);

  // Keep demo parking slots initialized idempotently
  useEffect(() => {
    void initializeParking().catch(() => {});
  }, [initializeParking]);

  // Verify protected Driver Mode status with backend when signed in as a driver
  useEffect(() => {
    if (!authSession.isDriver) return;
    let cancelled = false;
    void apiGetDriverStatus().catch(() => {
      if (!cancelled) {
        // Session synchronization handled by authClient if expired
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authSession.isDriver, authSession.user?.id]);

  const handleToggleDriverMode = async () => {
    if (!authSession.isDriver) {
      toast.error(
        "Driver Mode requires a signed-in driver account. Guest users cannot access restricted driver features.",
      );
      return;
    }
    setTogglingDriverMode(true);
    try {
      const nextActive = await authSession.toggleDriverMode();
      toast.success(
        nextActive
          ? "Driver Mode activated and synced with your driver session."
          : "Driver Mode deactivated.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Could not update Driver Mode.");
    } finally {
      setTogglingDriverMode(false);
    }
  };

  // Apply persisted user route preferences when loaded
  useEffect(() => {
    if (savedPreferences && !prefsAppliedRef.current) {
      prefsAppliedRef.current = true;
      setPreferences((prev) => ({
        ...prev,
        routeType: savedPreferences.preferredRouteType || prev.routeType,
        avoidTolls: Boolean(savedPreferences.avoidTolls),
        avoidHighways: Boolean(savedPreferences.avoidHighways),
      }));
    }
  }, [savedPreferences]);

  // Keep 3D sky synchronized when user flips global theme
  useEffect(() => {
    setNightScene3D(theme === "dark");
  }, [theme]);

  // Clear stale stop results whenever destination coordinates change, and focus the map on the new destination
  const destCoordKey = destination
    ? `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`
    : "";
  useEffect(() => {
    setDiscoveredPOIs([]);
    setSelectedPOI(null);
    setPoiSearchError(null);
    setPoiSearchMeta(null);
    if (destination) {
      setFocusPoint({ lat: destination.lat, lng: destination.lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destCoordKey]);

  // Fetch real OSM 3D urban context, Open-Meteo weather, and verified live traffic whenever route or destination changes
  useEffect(() => {
    const anchor = routeResult
      ? {
          lat: (routeResult.origin.lat + routeResult.destination.lat) / 2,
          lng: (routeResult.origin.lng + routeResult.destination.lng) / 2,
        }
      : destination || userLocation;

    const weatherAnchor = routeResult
      ? routeResult.destination
      : destination || userLocation || DEFAULT_FALLBACK_CENTER;

    let cancelled = false;
    void apiFetchWeather(weatherAnchor.lat, weatherAnchor.lng)
      .then((snap) => {
        if (!cancelled) setWeather(snap);
      })
      .catch(() => {});

    void apiFetchTraffic(weatherAnchor.lat, weatherAnchor.lng)
      .then((snap) => {
        if (!cancelled) setLiveTraffic(snap);
      })
      .catch(() => {});

    if (anchor) {
      // Reset previous destination's urban context cleanly before loading the new destination
      setUrbanContext(null);
      void apiFetchUrbanContext(anchor.lat, anchor.lng, 750)
        .then((ctx) => {
          if (!cancelled) setUrbanContext(ctx);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [routeResult, destination, userLocation]);

  // Progressive 3D urban context chunk loading as driver moves along route
  const handleRequestUrbanChunk = useCallback((lat: number, lng: number) => {
    void apiFetchUrbanContext(lat, lng, 650)
      .then((chunk) => {
        setUrbanContext((prev) => {
          if (!prev) return chunk;
          const mergeById = <T extends { id: string }>(a: T[], b: T[], maxLen: number): T[] => {
            const map = new Map<string, T>();
            for (const item of a) map.set(item.id, item);
            for (const item of b) map.set(item.id, item);
            return Array.from(map.values()).slice(-maxLen);
          };
          return {
            ...prev,
            source: chunk.source || prev.source,
            fetchedAt: chunk.fetchedAt,
            buildings: mergeById(prev.buildings, chunk.buildings, 220),
            roads: mergeById(prev.roads, chunk.roads, 180),
            parks: mergeById(prev.parks, chunk.parks, 50),
            waterBodies: mergeById(prev.waterBodies, chunk.waterBodies, 35),
            trees: mergeById(prev.trees, chunk.trees, 160),
            landmarks: mergeById(prev.landmarks, chunk.landmarks, 50),
            terrain: prev.terrain || chunk.terrain,
          };
        });
      })
      .catch(() => {});
  }, []);

  // Combine standard + emergency POIs for synchronized map rendering
  const visibleMapPOIs = useMemo(() => {
    const map = new Map<string, DiscoveredPOI>();
    for (const p of discoveredPOIs) map.set(p.id, p);
    for (const p of emergencyPOIs) map.set(p.id, p);
    return Array.from(map.values());
  }, [discoveredPOIs, emergencyPOIs]);

  const runRouteCalculation = useCallback(
    async (
      nextOrigin: GeoPoint,
      nextDestination: GeoPoint,
      nextWaypoints: JourneyStop[],
      nextPrefs: RoutePreferences,
      isEmergency = false,
      persistToJourneyId?: string | null,
    ) => {
      setIsCalculatingRoute(true);
      try {
        const result = await apiCalculateRoute({
          origin: nextOrigin,
          destination: nextDestination,
          waypoints: nextWaypoints,
          preferences: nextPrefs,
          isEmergency,
        });
        setRouteResult(result);
        setSelectedRouteId(result.recommendedRouteId);

        const chosen =
          result.alternatives.find((a) => a.routeId === result.recommendedRouteId) ||
          result.alternatives[0];

        if (persistToJourneyId && chosen) {
          await updateJourneyStopsMutation({
            journeyId: persistToJourneyId as any,
            waypoints: result.waypoints.map((w) => ({
              id: w.id,
              lat: w.lat,
              lng: w.lng,
              address: w.address,
              label: w.label,
              category: w.category,
              source: w.source,
            })),
            distanceKm: chosen.distanceKm,
            durationMin: chosen.durationMin,
            turnCount: chosen.turns.maneuverCount,
            qualityScore: chosen.qualityScore,
            geometry: chosen.geometry,
          });
        }

        toast.success(
          isEmergency
            ? `Emergency route ready (${chosen.distanceKm} km, ~${chosen.durationMin} min).`
            : `Calculated ${result.alternatives.length} route option(s) via OSRM.`,
        );
      } catch (err: any) {
        toast.error(err?.message || "Could not calculate driving route.");
      } finally {
        setIsCalculatingRoute(false);
      }
    },
    [updateJourneyStopsMutation],
  );

  // Automatic off-route recalculation from current live GPS coordinates
  const handleRecalculateFromPosition = useCallback(
    async (lat: number, lng: number) => {
      const targetDest = routeResult?.destination || destination;
      if (!targetDest) return;
      const gpsOrigin: GeoPoint = {
        lat,
        lng,
        address: `Live GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        label: "Current GPS Position",
      };
      setUserLocation({ lat, lng });
      await runRouteCalculation(
        gpsOrigin,
        targetDest,
        waypoints,
        preferences,
        Boolean(routeResult?.isEmergency),
        activeSavedJourneyId,
      );
    },
    [routeResult, destination, waypoints, preferences, activeSavedJourneyId, runRouteCalculation],
  );

  // Unified Live Navigation Controller shared across 2D, 3D, Split, Planner & AI Companion
  const liveNav = useLiveNavigation({
    routeResult,
    selectedRouteId,
    onRecalculateFromPosition: handleRecalculateFromPosition,
    onRequestUrbanChunk: handleRequestUrbanChunk,
  });

  // Workflow A: Calculate route from current planner state
  const handleCalculateRoute = () => {
    if (!origin || !destination) {
      toast.error("Choose both an origin and a destination first.");
      return;
    }
    void runRouteCalculation(origin, destination, waypoints, preferences, false, activeSavedJourneyId);
  };

  // Workflow A: Save current journey
  const handleSaveJourney = async () => {
    if (!routeResult) return;
    const chosen =
      routeResult.alternatives.find((a) => a.routeId === selectedRouteId) ||
      routeResult.alternatives[0];
    if (!chosen) return;

    const originName = routeResult.origin.label || routeResult.origin.address.split(",")[0];
    const destName = routeResult.destination.label || routeResult.destination.address.split(",")[0];
    const name = `${originName} → ${destName}`;

    try {
      const id = await saveJourneyMutation({
        name,
        origin: routeResult.origin,
        destination: routeResult.destination,
        waypoints: routeResult.waypoints.map((w) => ({
          id: w.id,
          lat: w.lat,
          lng: w.lng,
          address: w.address,
          label: w.label,
          category: w.category,
          source: w.source,
        })),
        selectedRouteId: chosen.routeId,
        distanceKm: chosen.distanceKm,
        durationMin: chosen.durationMin,
        turnCount: chosen.turns.maneuverCount,
        qualityScore: chosen.qualityScore,
        routeType: preferences.routeType,
        geometry: chosen.geometry,
        aiSummary: chosen.explanation,
        isEmergency: routeResult.isEmergency,
      });
      setActiveSavedJourneyId(String(id));
      toast.success(`Saved journey: ${name}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save journey.");
    }
  };

  // Workflow A: Reload saved journey onto both 2D & 3D
  const handleLoadSavedJourney = (journey: SavedJourneyRecord) => {
    setOrigin(journey.origin);
    setDestination(journey.destination);
    setWaypoints(journey.waypoints || []);
    setActiveSavedJourneyId(journey._id);

    const synthetic: PredictiveRouteResult = {
      origin: journey.origin,
      destination: journey.destination,
      waypoints: journey.waypoints || [],
      recommendedRouteId: journey.selectedRouteId || "saved_route",
      predictionConfidence: "Moderate",
      confidenceReason:
        "Loaded saved OSRM route geometry. Click Calculate & Sync Route to refresh alternatives.",
      provider: "Saved OSRM Journey",
      calculatedAt: journey._creationTime,
      isEmergency: journey.isEmergency,
      alternatives: [
        {
          routeId: journey.selectedRouteId || "saved_route",
          label: journey.name,
          distanceKm: journey.distanceKm,
          durationMin: journey.durationMin,
          estimatedAvgSpeedKmh:
            journey.durationMin > 0
              ? Number((journey.distanceKm / (journey.durationMin / 60)).toFixed(1))
              : 0,
          geometry: journey.geometry,
          steps: [],
          turns: {
            totalSteps: journey.turnCount,
            maneuverCount: journey.turnCount,
            sharpTurns: 0,
            roundabouts: 0,
            mergesAndRamps: 0,
            complexityScore: Math.min(100, journey.turnCount * 3),
            complexityLabel:
              journey.turnCount <= 8
                ? "Low"
                : journey.turnCount <= 18
                  ? "Moderate"
                  : "High",
            roadSummary: [],
          },
          qualityScore: journey.qualityScore,
          scoreBreakdown: {
            timeEfficiency: journey.qualityScore,
            distanceEfficiency: journey.qualityScore,
            turnSimplicity: journey.qualityScore,
          },
          tags: [journey.routeType || "Saved"],
          explanation:
            journey.aiSummary ||
            "Saved journey restored onto 2D OpenStreetMap and 3D Urban Digital Twin.",
          isRecommended: true,
          isFastest: true,
          isShortest: true,
          isLowestComplexity: true,
          timingDisclaimer:
            "Stored OSRM road-graph estimate. Live traffic is not included.",
        },
      ],
    };

    setRouteResult(synthetic);
    setSelectedRouteId(synthetic.recommendedRouteId);
    toast.success(`Loaded saved journey: ${journey.name}`);
  };

  const handleDeleteSavedJourney = async (id: string) => {
    try {
      await deleteJourneyMutation({ journeyId: id as any });
      if (activeSavedJourneyId === id) setActiveSavedJourneyId(null);
      toast.success("Saved journey removed.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete journey.");
    }
  };

  // Current geolocation helper
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Browser geolocation is unavailable.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });
        try {
          const point = await apiReverseGeocode(lat, lng);
          setOrigin(point);
          setFocusPoint({ lat, lng });
          toast.success(`Origin set to ${point.label || point.address}`);
        } catch {
          setOrigin({ lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, label: "Current Location" });
        }
      },
      () => {
        toast.error("Location permission denied. Search an address or pick on the map.");
      },
    );
  };

  // Workflow B: Discover real OSM parking/EV/fuel/rest/food/service stops around active reference location
  const handleDiscoverPOIs = useCallback(
    async (
      category: string,
      anchor: "destination" | "midpoint" | "origin",
      radiusMeters = 5000,
    ) => {
      const effDest = destination || routeResult?.destination || null;
      const effOrigin = origin || routeResult?.origin || null;

      let target: { lat: number; lng: number } | null = null;
      let referenceLabel = "";

      if (anchor === "destination" && effDest) {
        target = { lat: effDest.lat, lng: effDest.lng };
        referenceLabel = effDest.label || effDest.address.split(",")[0] || "Destination";
      } else if (anchor === "origin" && effOrigin) {
        target = { lat: effOrigin.lat, lng: effOrigin.lng };
        referenceLabel = effOrigin.label || effOrigin.address.split(",")[0] || "Origin";
      } else if (anchor === "midpoint") {
        if (routeResult) {
          const activeAlt =
            routeResult.alternatives.find((a) => a.routeId === selectedRouteId) ||
            routeResult.alternatives[0];
          if (activeAlt && activeAlt.geometry.length > 0) {
            const mid = activeAlt.geometry[Math.floor(activeAlt.geometry.length / 2)];
            target = { lat: mid[0], lng: mid[1] };
          } else {
            target = {
              lat: (routeResult.origin.lat + routeResult.destination.lat) / 2,
              lng: (routeResult.origin.lng + routeResult.destination.lng) / 2,
            };
          }
          referenceLabel = "Route Midpoint";
        } else if (effOrigin && effDest) {
          target = {
            lat: (effOrigin.lat + effDest.lat) / 2,
            lng: (effOrigin.lng + effDest.lng) / 2,
          };
          referenceLabel = "Journey Midpoint";
        }
      } else if (effDest) {
        target = { lat: effDest.lat, lng: effDest.lng };
        referenceLabel = effDest.label || effDest.address.split(",")[0] || "Destination";
      } else if (effOrigin) {
        target = { lat: effOrigin.lat, lng: effOrigin.lng };
        referenceLabel = effOrigin.label || effOrigin.address.split(",")[0] || "Origin";
      } else if (userLocation) {
        target = userLocation;
        referenceLabel = "Current Location";
      }

      if (!target) {
        setPoiSearchError(
          "Select a destination or origin first so stops can be searched around your actual location.",
        );
        return;
      }

      const requestId = ++poiRequestIdRef.current;
      setIsSearchingPOIs(true);
      setPoiSearchError(null);
      setSelectedPOI(null);
      setPoiSearchMeta({
        category,
        anchor,
        radiusMeters,
        referenceLabel,
        referenceLat: target.lat,
        referenceLng: target.lng,
      });

      try {
        const rawPois = await apiDiscoverPOIs({
          lat: target.lat,
          lng: target.lng,
          category,
          radiusMeters,
          limit: 15,
        });

        // Ignore stale response if user switched destination or category while in flight
        if (requestId !== poiRequestIdRef.current) return;

        // Enforce client-side geographic sanity & attach reference label consistently
        const maxKm = radiusMeters / 1000;
        const verifiedPois = rawPois
          .map((p) => ({
            ...p,
            distanceKm: Number(
              clientHaversineKm(target!.lat, target!.lng, p.lat, p.lng).toFixed(2),
            ),
            referenceLabel,
          }))
          .filter((p) => p.distanceKm <= maxKm + 0.05)
          .sort((a, b) => a.distanceKm - b.distanceKm);

        setDiscoveredPOIs(verifiedPois);
        setFocusPoint({ lat: target.lat, lng: target.lng });
      } catch (err: any) {
        if (requestId !== poiRequestIdRef.current) return;
        const msg =
          err?.message || "Failed to fetch nearby OpenStreetMap stops. Please retry.";
        setDiscoveredPOIs([]);
        setPoiSearchError(msg);
        toast.error(msg);
      } finally {
        if (requestId === poiRequestIdRef.current) {
          setIsSearchingPOIs(false);
        }
      }
    },
    [destination, origin, routeResult, selectedRouteId, userLocation],
  );

  // Workflow B: Add stop to journey with duplicate prevention, recalculate OSRM, sync 2D/3D
  const handleAddPOIToRoute = (poi: DiscoveredPOI) => {
    const duplicate = waypoints.some(
      (w) =>
        (w.sourcePoiId && w.sourcePoiId === poi.id) ||
        clientHaversineKm(w.lat, w.lng, poi.lat, poi.lng) < 0.05,
    );
    if (duplicate) {
      toast.info(`"${poi.name}" is already in your route stops.`);
      return;
    }

    const resolvedAddress =
      poi.address && poi.address !== "Not available"
        ? poi.address
        : `${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}`;

    const newStop: JourneyStop = {
      id: `stop_${poi.id}`,
      sourcePoiId: poi.id,
      lat: poi.lat,
      lng: poi.lng,
      address: resolvedAddress,
      label: poi.name,
      category:
        poi.category === "hospital" || poi.category === "police" || poi.category === "fire"
          ? "emergency"
          : poi.category,
      source: "osm",
    };

    const nextWaypoints = [...waypoints, newStop];
    setWaypoints(nextWaypoints);
    setSelectedPOI(poi);
    setFocusPoint({ lat: poi.lat, lng: poi.lng });

    const effOrigin = origin || routeResult?.origin;
    const effDest = destination || routeResult?.destination;

    if (effOrigin && effDest) {
      void runRouteCalculation(
        effOrigin,
        effDest,
        nextWaypoints,
        preferences,
        false,
        activeSavedJourneyId,
      );
    } else if (effDest) {
      toast.success(
        `Added "${poi.name}" as a route stop. Set an origin in Planner to calculate the full route.`,
      );
    } else {
      toast.success(
        `Added "${poi.name}" as a route stop. Set an origin and destination in Planner to calculate the route.`,
      );
    }
  };

  const handleRemoveWaypoint = (id: string) => {
    const next = waypoints.filter((w) => w.id !== id);
    setWaypoints(next);
    if (origin && destination && routeResult) {
      void runRouteCalculation(origin, destination, next, preferences, false, activeSavedJourneyId);
    }
  };

  // Map click handler for Origin, Destination, or Community Road Report coordinates
  const handleMapClick = async (lat: number, lng: number) => {
    const mode = mapPickMode;
    setMapPickMode("none");
    if (mode === "none") return;

    let point: GeoPoint = {
      lat,
      lng,
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      label: "Map Selection",
    };
    try {
      point = await apiReverseGeocode(lat, lng);
    } catch {
      // keep coordinates fallback
    }

    if (mode === "origin") {
      setOrigin(point);
      toast.success(`Origin set: ${point.label || point.address}`);
    } else if (mode === "destination") {
      setDestination(point);
      toast.success(`Destination set: ${point.label || point.address}`);
    } else if (mode === "report") {
      setSelectedReportLocation(point);
      toast.success(`Report coordinates picked: ${point.label || point.address}`);
    }
  };

  // Workflow C: Community Road Reporting
  const handleSubmitCommunityReport = async (payload: {
    type: CommunityReport["type"];
    lat: number;
    lng: number;
    address: string;
    description: string;
    severity: CommunityReport["severity"];
    ttlHours: number;
  }) => {
    try {
      const res = await submitReportMutation(payload);
      setSelectedReportLocation(null);
      setFocusPoint({ lat: payload.lat, lng: payload.lng });
      if (res && (res as any).mergedDuplicate) {
        toast.info("Matched an existing nearby report and incremented its confirmation count.");
      } else {
        toast.success("Community road report published and synced to 2D/3D views.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to publish report.");
    }
  };

  // Workflow D: Emergency Facility Discovery & Routing
  const handleDiscoverEmergency = async (category: "hospital" | "police" | "emergency") => {
    const anchor =
      userLocation ||
      routeResult?.origin ||
      origin ||
      DEFAULT_FALLBACK_CENTER;

    setIsSearchingEmergency(true);
    try {
      const pois = await apiDiscoverPOIs({
        lat: anchor.lat,
        lng: anchor.lng,
        category,
        radiusMeters: 6000,
        limit: 10,
      });
      setEmergencyPOIs(pois);
      setFocusPoint({ lat: anchor.lat, lng: anchor.lng });
      if (pois.length === 0) {
        toast.info("No matching OpenStreetMap emergency facilities found within 6 km.");
      } else {
        toast.success(`Found ${pois.length} nearby emergency facility(ies).`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Emergency service lookup failed.");
    } finally {
      setIsSearchingEmergency(false);
    }
  };

  const handleRouteToEmergencyFacility = (poi: DiscoveredPOI) => {
    const start: GeoPoint = origin ||
      routeResult?.origin || {
        lat: (userLocation || DEFAULT_FALLBACK_CENTER).lat,
        lng: (userLocation || DEFAULT_FALLBACK_CENTER).lng,
        address: userLocation ? "Current Driver Location" : "Midtown Manhattan (Default Origin)",
        label: userLocation ? "Current Location" : "Start",
      };
    const dest: GeoPoint = {
      lat: poi.lat,
      lng: poi.lng,
      address: poi.address,
      label: poi.name,
    };
    setOrigin(start);
    setDestination(dest);
    setWaypoints([]);
    void runRouteCalculation(
      start,
      dest,
      [],
      { routeType: "fastest", avoidTolls: false, avoidHighways: false },
      true,
    );
  };

  // Workflow E: Execute clickable AI Companion map actions directly on 2D/3D viewport
  const handleExecuteCompanionAction = (action: CompanionMapAction) => {
    if (
      (action.type === "apply_route" || action.type === "apply_emergency_route") &&
      action.routeResult
    ) {
      setOrigin(action.routeResult.origin);
      setDestination(action.routeResult.destination);
      setWaypoints(action.routeResult.waypoints || []);
      setRouteResult(action.routeResult);
      setSelectedRouteId(action.routeResult.recommendedRouteId);
      toast.success(`Applied AI route to 2D & 3D views.`);
      return;
    }

    if (action.type === "add_stop" && action.poi) {
      handleAddPOIToRoute(action.poi);
      return;
    }

    if (action.type === "highlight_pois" && action.pois && action.pois.length > 0) {
      const isEmergencySet = action.pois.some(
        (p) => p.category === "hospital" || p.category === "police" || p.category === "fire",
      );
      if (isEmergencySet) {
        setEmergencyPOIs(action.pois);
      } else {
        setDiscoveredPOIs(action.pois);
      }
      setFocusPoint({ lat: action.pois[0].lat, lng: action.pois[0].lng });
      toast.success(`Highlighted ${action.pois.length} OpenStreetMap location(s) on map.`);
    }
  };

  const navItems = [
    { to: "/planner", label: "Planner", icon: Compass },
    { to: "/stops", label: "Stops", icon: ParkingSquare },
    { to: "/safety", label: "Safety", icon: ShieldAlert },
    { to: "/emergency", label: "Emergency", icon: Siren },
    { to: "/insights", label: "Insights", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Clean Single-Row 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 h-14 px-4 lg:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-display font-bold text-xs">
            SR
          </div>
          <span className="font-display font-semibold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            SmartRoutes
          </span>
        </div>

        {/* Zone 2: Single-Line Navigation Links */}
        <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Zone 3: Compact Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleToggleDriverMode()}
            disabled={togglingDriverMode}
            title={
              authSession.isDriver
                ? authSession.driverModeActive
                  ? "Driver Mode is active (click to deactivate)"
                  : "Activate authenticated Driver Mode"
                : "Sign in with a driver account to unlock Driver Mode"
            }
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50 ${
              authSession.driverModeActive
                ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white"
                : authSession.isDriver
                  ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {authSession.isDriver ? (
              <Car className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            <span>
              {togglingDriverMode
                ? "Syncing..."
                : authSession.driverModeActive
                  ? "Driver Mode: On"
                  : authSession.isGuest
                    ? "Driver Mode (Sign in)"
                    : "Driver Mode"}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setCompanionOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Companion</span>
          </button>

          <SignOutButton />
        </div>
      </header>

      {/* Main Split Command Center Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 max-w-[1920px] w-full mx-auto">
        {/* Left Control & Intelligence Panel */}
        <section className="lg:col-span-4 xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 overflow-y-auto lg:max-h-[calc(100vh-5.5rem)]">
          <Routes>
            <Route
              path="/planner"
              element={
                <RoutePlannerPanel
                  origin={origin}
                  destination={destination}
                  waypoints={waypoints}
                  preferences={preferences}
                  routeResult={routeResult}
                  selectedRouteId={selectedRouteId}
                  isCalculating={isCalculatingRoute}
                  savedJourneys={savedJourneys}
                  favourites={favourites}
                  onChangeOrigin={setOrigin}
                  onChangeDestination={setDestination}
                  onRemoveWaypoint={handleRemoveWaypoint}
                  onChangePreferences={setPreferences}
                  onCalculateRoute={handleCalculateRoute}
                  onSelectRoute={setSelectedRouteId}
                  onSaveJourney={handleSaveJourney}
                  onLoadSavedJourney={handleLoadSavedJourney}
                  onDeleteSavedJourney={handleDeleteSavedJourney}
                  onRequestMapPick={(mode) => {
                    if (viewMode === "3d") setViewMode("split");
                    setMapPickMode(mode);
                  }}
                  onUseCurrentLocation={handleUseCurrentLocation}
                  onAskAIExplainRoute={() => {
                    setPendingAIPrompt(
                      "Analyze my active route alternatives, compare travel time vs turn complexity, and explain which option is best and why.",
                    );
                    setCompanionOpen(true);
                  }}
                  liveNav={liveNav}
                />
              }
            />

            <Route
              path="/stops"
              element={
                <StopsAndParkingPanel
                  origin={origin}
                  destination={destination}
                  waypoints={waypoints}
                  favourites={favourites}
                  routeResult={routeResult}
                  discoveredPOIs={discoveredPOIs}
                  selectedPOI={selectedPOI}
                  isSearchingPOIs={isSearchingPOIs}
                  poiSearchError={poiSearchError}
                  poiSearchMeta={poiSearchMeta}
                  onChangeDestination={setDestination}
                  onDiscoverPOIs={(cat, anchor, radius) =>
                    void handleDiscoverPOIs(cat, anchor, radius)
                  }
                  onSelectPOI={setSelectedPOI}
                  onAddStopToJourney={handleAddPOIToRoute}
                  onFocusPoint={(lat, lng) => setFocusPoint({ lat, lng })}
                  onRequestMapPickDestination={() => {
                    if (viewMode === "3d") setViewMode("split");
                    setMapPickMode("destination");
                  }}
                  onUseCurrentLocation={handleUseCurrentLocation}
                />
              }
            />

            <Route
              path="/safety"
              element={
                <SafetyAndCommunityPanel
                  reports={communityReports}
                  currentUserId={loggedInUser?._id ?? null}
                  selectedReportLocation={selectedReportLocation}
                  weather={weather}
                  onRequestMapPickForReport={() => {
                    if (viewMode === "3d") setViewMode("split");
                    setMapPickMode("report");
                  }}
                  onSubmitReport={handleSubmitCommunityReport}
                  onConfirmReport={async (id) => {
                    await confirmReportMutation({ reportId: id as any });
                    toast.success("Confirmed community report.");
                  }}
                  onFlagReport={async (id) => {
                    await flagReportMutation({ reportId: id as any });
                    toast.info("Flagged report for review.");
                  }}
                  onResolveReport={async (id) => {
                    await resolveReportMutation({ reportId: id as any });
                    toast.success("Report marked resolved.");
                  }}
                  onFocusPoint={(lat, lng) => setFocusPoint({ lat, lng })}
                />
              }
            />

            <Route
              path="/emergency"
              element={
                <EmergencyPanel
                  emergencyPOIs={emergencyPOIs}
                  isSearching={isSearchingEmergency}
                  activeEmergencyRoute={routeResult?.isEmergency ? routeResult : null}
                  preferences={savedPreferences || null}
                  currentCoords={userLocation || origin || routeResult?.origin || null}
                  onDiscoverEmergency={(cat) => void handleDiscoverEmergency(cat)}
                  onRouteToFacility={handleRouteToEmergencyFacility}
                />
              }
            />

            <Route
              path="/insights"
              element={
                <InsightsAndProfilePanel
                  savedJourneys={savedJourneys}
                  communityReports={communityReports}
                  favourites={favourites}
                  preferences={savedPreferences || null}
                  onSavePreferences={async (next) => {
                    await savePreferencesMutation(next);
                    setPreferences((prev) => ({
                      ...prev,
                      routeType: next.preferredRouteType,
                      avoidTolls: next.avoidTolls,
                      avoidHighways: next.avoidHighways,
                    }));
                  }}
                  onAddFavourite={async (fav) => {
                    await addFavouriteMutation(fav);
                    toast.success(`Saved favourite: ${fav.label}`);
                  }}
                  onRemoveFavourite={async (id) => {
                    await removeFavouriteMutation({ favouriteId: id as any });
                    toast.success("Favourite removed.");
                  }}
                  onUseFavouriteAsDestination={(fav) => {
                    setDestination({
                      lat: fav.lat,
                      lng: fav.lng,
                      address: fav.address,
                      label: fav.label,
                    });
                    setFocusPoint({ lat: fav.lat, lng: fav.lng });
                    navigate("/planner");
                    toast.success(`Destination set to ${fav.label}.`);
                  }}
                  onDeleteAllPersonalData={async () => {
                    await deleteAllPersonalDataMutation({});
                    setActiveSavedJourneyId(null);
                    toast.success("Deleted all saved journeys, favourites, chat sessions, and preferences.");
                  }}
                />
              }
            />

            <Route path="*" element={<Navigate to="/planner" replace />} />
          </Routes>
        </section>

        {/* Right Synchronized 2D / 3D Spatial Viewport */}
        <section className="lg:col-span-8 xl:col-span-8 min-h-[520px] lg:h-[calc(100vh-5.5rem)]">
          <MapViewport
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            routeResult={routeResult}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            destination={destination}
            waypoints={waypoints}
            discoveredPOIs={visibleMapPOIs}
            selectedPOI={selectedPOI}
            onSelectPOI={(poi) => {
              setSelectedPOI(poi);
              setFocusPoint({ lat: poi.lat, lng: poi.lng });
            }}
            onAddPOIToRoute={handleAddPOIToRoute}
            communityReports={communityReports}
            urbanContext={urbanContext}
            weather={weather}
            liveTraffic={liveTraffic}
            liveNav={liveNav}
            theme={theme}
            nightScene3D={nightScene3D}
            onToggleNightScene3D={() => setNightScene3D((n) => !n)}
            mapPickMode={mapPickMode}
            onCancelMapPick={() => setMapPickMode("none")}
            onMapClick={(lat, lng) => void handleMapClick(lat, lng)}
            focusPoint={focusPoint}
          />
        </section>
      </main>

      {/* Multi-Agent Gemini AI Driving Companion Drawer */}
      <DrivingCompanionDrawer
        isOpen={companionOpen}
        onClose={() => setCompanionOpen(false)}
        activeRoute={routeResult}
        selectedRouteId={selectedRouteId}
        communityReports={communityReports}
        preferences={savedPreferences || null}
        userLocation={userLocation}
        liveNavigation={liveNav.snapshot}
        liveTraffic={liveTraffic}
        onExecuteMapAction={handleExecuteCompanionAction}
        pendingPrompt={pendingAIPrompt}
        onConsumePendingPrompt={() => setPendingAIPrompt(null)}
      />
    </div>
  );
}
