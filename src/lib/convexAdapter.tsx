import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
  type OptionalRestArgs,
} from "convex/server";
import type {
  CommunityReport,
  FavouriteDestination,
  SavedJourneyRecord,
  UserPreferencesRecord,
} from "../types/mobility";
import {
  apiAuthGuest,
  apiAuthLogin,
  apiAuthLogout,
  apiAuthMe,
  apiAuthRegister,
  apiSetDriverMode,
  authFetch,
  onAuthExpired,
  type AuthRole,
  type AuthUser,
} from "../services/authClient";

export const USE_REAL_CONVEX = false;

const STORAGE_KEY = "smartroutes_v3_persisted_state";

interface LocalUser {
  _id: string;
  email?: string;
  name: string;
  role: AuthRole;
  isAnonymous?: boolean;
  isGuest: boolean;
  driverModeActive: boolean;
}

interface LocalRoute {
  _id: string;
  _creationTime: number;
  userId: string;
  startLocation: { lat: number; lng: number; address: string };
  endLocation: { lat: number; lng: number; address: string };
  routeOptions: Array<{
    routeId: string;
    distance: number;
    estimatedTime: number;
    trafficLevel: string;
    waypoints: Array<{ lat: number; lng: number }>;
    isRecommended: boolean;
  }>;
  status: string;
}

interface LocalParkingSlot {
  _id: string;
  name: string;
  location: { lat: number; lng: number; address: string };
  totalSlots: number;
  availableSlots: number;
  pricePerHour: number;
  amenities: string[];
  isActive: boolean;
}

interface LocalBooking {
  _id: string;
  userId: string;
  parkingSlotId: string;
  startTime: number;
  endTime: number;
  totalAmount: number;
  paymentStatus: string;
  bookingStatus: string;
  vehicleNumber: string;
}

interface LocalEmergencyAlert {
  _id: string;
  type: string;
  currentLocation: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  estimatedRoute: Array<{ lat: number; lng: number }>;
  priority: string;
  isActive: boolean;
  vehicleId: string;
}

interface LocalChatMessage {
  role: string;
  content: string;
  timestamp: number;
}

interface LocalChatSession {
  _id: string;
  userId: string;
  messages: LocalChatMessage[];
  isActive: boolean;
}

interface LocalStoreState {
  routes: LocalRoute[];
  parkingSlots: LocalParkingSlot[];
  bookings: LocalBooking[];
  emergencyAlerts: LocalEmergencyAlert[];
  chatSessions: LocalChatSession[];
  savedJourneys: SavedJourneyRecord[];
  communityReports: CommunityReport[];
  favourites: FavouriteDestination[];
  preferencesByUser: Record<string, UserPreferencesRecord>;
}

const INITIAL_PARKING_SLOTS: LocalParkingSlot[] = [
  {
    _id: "parking_1",
    name: "City Center Mall Parking (Demo Slot)",
    location: {
      lat: 40.7128,
      lng: -74.006,
      address: "123 Main St, New York, NY",
    },
    totalSlots: 200,
    availableSlots: 45,
    pricePerHour: 5,
    amenities: ["CCTV", "Security", "EV Charging"],
    isActive: true,
  },
  {
    _id: "parking_2",
    name: "Downtown Business District (Demo Slot)",
    location: {
      lat: 40.7589,
      lng: -73.9851,
      address: "456 Business Ave, New York, NY",
    },
    totalSlots: 150,
    availableSlots: 23,
    pricePerHour: 8,
    amenities: ["CCTV", "Valet Service", "Car Wash"],
    isActive: true,
  },
];

const DEFAULT_PREFERENCES: UserPreferencesRecord = {
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

const TRAFFIC_BY_CAMERA: Record<
  string,
  {
    routeSegment: string;
    trafficLevel: string;
    averageSpeed: number;
    congestionScore: number;
    lastUpdated: number;
    cameraId: string;
  }
> = {
  cam_001: {
    routeSegment: "cam_001",
    trafficLevel: "medium",
    averageSpeed: 34,
    congestionScore: 0.55,
    lastUpdated: Date.now(),
    cameraId: "cam_001",
  },
  cam_002: {
    routeSegment: "cam_002",
    trafficLevel: "low",
    averageSpeed: 62,
    congestionScore: 0.22,
    lastUpdated: Date.now(),
    cameraId: "cam_002",
  },
  cam_003: {
    routeSegment: "cam_003",
    trafficLevel: "high",
    averageSpeed: 18,
    congestionScore: 0.84,
    lastUpdated: Date.now(),
    cameraId: "cam_003",
  },
  cam_004: {
    routeSegment: "cam_004",
    trafficLevel: "low",
    averageSpeed: 54,
    congestionScore: 0.28,
    lastUpdated: Date.now(),
    cameraId: "cam_004",
  },
};

function approxDistKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function loadInitialState(): LocalStoreState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalStoreState>;
      return {
        routes: Array.isArray(parsed.routes) ? parsed.routes : [],
        parkingSlots:
          Array.isArray(parsed.parkingSlots) && parsed.parkingSlots.length > 0
            ? parsed.parkingSlots
            : INITIAL_PARKING_SLOTS,
        bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
        emergencyAlerts: Array.isArray(parsed.emergencyAlerts)
          ? parsed.emergencyAlerts
          : [],
        chatSessions: Array.isArray(parsed.chatSessions) ? parsed.chatSessions : [],
        savedJourneys: Array.isArray(parsed.savedJourneys)
          ? parsed.savedJourneys
          : [],
        communityReports: Array.isArray(parsed.communityReports)
          ? parsed.communityReports
          : [],
        favourites: Array.isArray(parsed.favourites) ? parsed.favourites : [],
        preferencesByUser: parsed.preferencesByUser || {},
      };
    }
  } catch {
    // ignore corrupted storage
  }
  return {
    routes: [],
    parkingSlots: INITIAL_PARKING_SLOTS,
    bookings: [],
    emergencyAlerts: [],
    chatSessions: [],
    savedJourneys: [],
    communityReports: [],
    favourites: [],
    preferencesByUser: {},
  };
}

function toAdapterUser(authUser: AuthUser | null): LocalUser | null {
  if (!authUser) return null;
  return {
    _id: authUser.id,
    email: authUser.email ?? undefined,
    name: authUser.name,
    role: authUser.role,
    isAnonymous: authUser.isGuest,
    isGuest: authUser.isGuest,
    driverModeActive: authUser.driverModeActive,
  };
}

interface LocalContextValue {
  state: LocalStoreState;
  authUser: AuthUser | null;
  activeUser: LocalUser | null;
  isAuthLoading: boolean;
  signIn: (provider: string, params?: FormData | Record<string, unknown>) => Promise<void>;
  signOut: () => Promise<void>;
  toggleDriverMode: (next?: boolean) => Promise<boolean>;
  refreshSession: () => Promise<void>;
  runMutation: (name: string, args: Record<string, any>) => Promise<any>;
  runAction: (name: string, args: Record<string, any>) => Promise<any>;
}

const LocalConvexContext = createContext<LocalContextValue | null>(null);

function UnifiedSmartRoutesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocalStoreState>(() => loadInitialState());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  const activeUser = useMemo(() => toAdapterUser(authUser), [authUser]);

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiAuthMe();
      setAuthUser(res.authenticated && res.user ? res.user : null);
    } catch {
      setAuthUser(null);
    }
  }, []);

  // Re-hydrate authenticated driver or guest session from HttpOnly JWT cookie on boot/refresh
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiAuthMe();
        if (!cancelled) {
          setAuthUser(res.authenticated && res.user ? res.user : null);
        }
      } catch {
        if (!cancelled) setAuthUser(null);
      } finally {
        if (!cancelled) setIsAuthLoading(false);
      }
    })();

    const unsubscribe = onAuthExpired(() => {
      setAuthUser(null);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Persist non-auth workspace data (journeys, favourites, preferences, reports) — NEVER tokens or auth user
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  // Cross-tab reactive synchronization for workspace data
  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === STORAGE_KEY && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue) as Partial<LocalStoreState>;
          setState((prev) => ({
            ...prev,
            ...parsed,
          }));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback(
    async (provider: string, params?: FormData | Record<string, unknown>) => {
      if (provider === "anonymous" || provider === "guest") {
        const res = await apiAuthGuest();
        setAuthUser(res.user);
        return;
      }

      const email =
        params instanceof FormData
          ? String(params.get("email") || "").trim()
          : String((params as Record<string, unknown>)?.email || "").trim();
      const password =
        params instanceof FormData
          ? String(params.get("password") || "")
          : String((params as Record<string, unknown>)?.password || "");
      const flow =
        params instanceof FormData
          ? String(params.get("flow") || "signIn")
          : String((params as Record<string, unknown>)?.flow || "signIn");
      const name =
        params instanceof FormData
          ? String(params.get("name") || "").trim()
          : String((params as Record<string, unknown>)?.name || "").trim();

      const res =
        flow === "signUp"
          ? await apiAuthRegister(email, password, name || undefined)
          : await apiAuthLogin(email, password);
      setAuthUser(res.user);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await apiAuthLogout();
    setAuthUser(null);
  }, []);

  const toggleDriverMode = useCallback(
    async (next?: boolean): Promise<boolean> => {
      const target =
        typeof next === "boolean" ? next : !Boolean(authUser?.driverModeActive);
      const res = await apiSetDriverMode(target);
      if (res.user) {
        setAuthUser(res.user);
      }
      return Boolean(res.driverModeActive ?? res.user?.driverModeActive);
    },
    [authUser?.driverModeActive],
  );

  const runMutation = useCallback(
    async (name: string, args: Record<string, any> = {}) => {
      const uid = activeUser?._id;

      // Saved Journeys (Workflow A & B)
      if (name === "journeys:saveJourney") {
        if (!uid) throw new Error("Sign in required to save journeys.");
        const id = `journey_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const record: SavedJourneyRecord = {
          _id: id,
          _creationTime: Date.now(),
          userId: uid,
          name: args.name,
          origin: args.origin,
          destination: args.destination,
          waypoints: args.waypoints || [],
          selectedRouteId: args.selectedRouteId,
          distanceKm: args.distanceKm,
          durationMin: args.durationMin,
          turnCount: args.turnCount,
          qualityScore: args.qualityScore,
          routeType: args.routeType,
          geometry: args.geometry,
          aiSummary: args.aiSummary,
          isEmergency: args.isEmergency,
        };
        setState((prev) => ({
          ...prev,
          savedJourneys: [record, ...prev.savedJourneys],
        }));
        return id;
      }

      if (name === "journeys:updateJourneyStops") {
        if (!uid) throw new Error("Not authenticated");
        setState((prev) => ({
          ...prev,
          savedJourneys: prev.savedJourneys.map((j) =>
            j._id === args.journeyId && j.userId === uid
              ? {
                  ...j,
                  waypoints: args.waypoints,
                  distanceKm: args.distanceKm,
                  durationMin: args.durationMin,
                  turnCount: args.turnCount,
                  qualityScore: args.qualityScore,
                  geometry: args.geometry,
                }
              : j,
          ),
        }));
        return null;
      }

      if (name === "journeys:deleteJourney") {
        if (!uid) throw new Error("Not authenticated");
        setState((prev) => ({
          ...prev,
          savedJourneys: prev.savedJourneys.filter(
            (j) => !(j._id === args.journeyId && j.userId === uid),
          ),
        }));
        return null;
      }

      // Community Road Intelligence (Workflow C)
      if (name === "community:submitReport") {
        if (!uid) throw new Error("Sign in required to submit road reports.");
        const desc = String(args.description || "").trim();
        if (desc.length < 4) {
          throw new Error("Please enter a brief description (at least 4 characters).");
        }
        const now = Date.now();
        const recent = state.communityReports.filter(
          (r) => r.createdBy === uid && now - r.createdAt < 10 * 60 * 1000,
        );
        if (recent.length >= 5) {
          throw new Error("Rate limit reached: wait a few minutes before submitting another report.");
        }

        const duplicate = state.communityReports.find(
          (r) =>
            r.verificationStatus !== "resolved" &&
            r.expiresAt > now &&
            r.type === args.type &&
            approxDistKm(r.lat, r.lng, args.lat, args.lng) < 0.2,
        );

        if (duplicate) {
          setState((prev) => ({
            ...prev,
            communityReports: prev.communityReports.map((r) => {
              if (r._id !== duplicate._id) return r;
              if (r.confirmedBy.includes(uid)) return r;
              const nextConf = r.confirmations + 1;
              return {
                ...r,
                confirmations: nextConf,
                confirmedBy: [...r.confirmedBy, uid],
                verificationStatus: nextConf >= 2 ? "confirmed" : r.verificationStatus,
              };
            }),
          }));
          return { reportId: duplicate._id, mergedDuplicate: true };
        }

        const ttlMs = Math.min(Math.max(Number(args.ttlHours || 6), 1), 72) * 3600 * 1000;
        const reportId = `report_${now}_${Math.random().toString(36).slice(2, 6)}`;
        const newReport: CommunityReport = {
          _id: reportId,
          type: args.type,
          lat: args.lat,
          lng: args.lng,
          address: args.address,
          description: desc,
          severity: args.severity || "moderate",
          dataSource: "community",
          verificationStatus: "unverified",
          confirmations: 1,
          confirmedBy: [uid],
          flaggedBy: [],
          createdBy: uid,
          createdAt: now,
          expiresAt: now + ttlMs,
        };
        setState((prev) => ({
          ...prev,
          communityReports: [newReport, ...prev.communityReports],
        }));
        return { reportId, mergedDuplicate: false };
      }

      if (name === "community:confirmReport") {
        if (!uid) throw new Error("Not authenticated");
        setState((prev) => ({
          ...prev,
          communityReports: prev.communityReports.map((r) => {
            if (r._id !== args.reportId || r.confirmedBy.includes(uid)) return r;
            const nextConf = r.confirmations + 1;
            return {
              ...r,
              confirmations: nextConf,
              confirmedBy: [...r.confirmedBy, uid],
              verificationStatus: nextConf >= 2 ? "confirmed" : r.verificationStatus,
            };
          }),
        }));
        return null;
      }

      if (name === "community:flagReport") {
        if (!uid) throw new Error("Not authenticated");
        setState((prev) => ({
          ...prev,
          communityReports: prev.communityReports.map((r) => {
            if (r._id !== args.reportId || r.flaggedBy.includes(uid)) return r;
            const nextFlagged = [...r.flaggedBy, uid];
            return {
              ...r,
              flaggedBy: nextFlagged,
              verificationStatus:
                nextFlagged.length >= 2 ? "flagged" : r.verificationStatus,
            };
          }),
        }));
        return null;
      }

      if (name === "community:resolveReport") {
        if (!uid) throw new Error("Not authenticated");
        setState((prev) => ({
          ...prev,
          communityReports: prev.communityReports.map((r) =>
            r._id === args.reportId && r.createdBy === uid
              ? { ...r, verificationStatus: "resolved" }
              : r,
          ),
        }));
        return null;
      }

      // Personalization & Favourites (Workflow F)
      if (name === "preferences:savePreferences") {
        if (!uid) throw new Error("Not authenticated");
        setState((prev) => ({
          ...prev,
          preferencesByUser: {
            ...prev.preferencesByUser,
            [uid]: {
              ...DEFAULT_PREFERENCES,
              ...(args as Partial<UserPreferencesRecord>),
            },
          },
        }));
        return `pref_${uid}`;
      }

      if (name === "preferences:addFavourite") {
        if (!uid) throw new Error("Not authenticated");
        const favId = `fav_${Date.now()}`;
        const fav: FavouriteDestination = {
          _id: favId,
          userId: uid,
          label: String(args.label || "").trim(),
          address: args.address,
          lat: args.lat,
          lng: args.lng,
          category: args.category || "frequent",
          createdAt: Date.now(),
        };
        setState((prev) => ({
          ...prev,
          favourites: [fav, ...prev.favourites],
        }));
        return favId;
      }

      if (name === "preferences:removeFavourite") {
        if (!uid) throw new Error("Not authenticated");
        setState((prev) => ({
          ...prev,
          favourites: prev.favourites.filter(
            (f) => !(f._id === args.favouriteId && f.userId === uid),
          ),
        }));
        return null;
      }

      if (name === "preferences:deleteAllPersonalData") {
        if (!uid) throw new Error("Not authenticated");
        setState((prev) => {
          const nextPrefs = { ...prev.preferencesByUser };
          delete nextPrefs[uid];
          return {
            ...prev,
            savedJourneys: prev.savedJourneys.filter((j) => j.userId !== uid),
            favourites: prev.favourites.filter((f) => f.userId !== uid),
            chatSessions: prev.chatSessions.filter((c) => c.userId !== uid),
            preferencesByUser: nextPrefs,
          };
        });
        return null;
      }

      // Preserved original Smart Traffic mutations
      if (name === "parking:initializeParkingData") {
        setState((prev) =>
          prev.parkingSlots.length > 0
            ? prev
            : { ...prev, parkingSlots: INITIAL_PARKING_SLOTS },
        );
        return null;
      }

      if (name === "routes:planRoute") {
        const id = `route_${Date.now()}`;
        const newRoute: LocalRoute = {
          _id: id,
          _creationTime: Date.now(),
          userId: uid || "user_guest",
          startLocation: args.startLocation,
          endLocation: args.endLocation,
          routeOptions: [
            {
              routeId: "route_1",
              distance: 15.2,
              estimatedTime: 25,
              trafficLevel: "low",
              waypoints: [
                { lat: args.startLocation.lat, lng: args.startLocation.lng },
                { lat: args.endLocation.lat, lng: args.endLocation.lng },
              ],
              isRecommended: true,
            },
          ],
          status: "planning",
        };
        setState((prev) => ({ ...prev, routes: [newRoute, ...prev.routes] }));
        return id;
      }

      if (name === "parking:bookParkingSlot") {
        const bookingId = `booking_${Date.now()}`;
        setState((prev) => {
          const slot = prev.parkingSlots.find((s) => s._id === args.parkingSlotId);
          if (!slot || slot.availableSlots <= 0) {
            throw new Error("No available slots");
          }
          const hours = (args.endTime - args.startTime) / (1000 * 60 * 60);
          const booking: LocalBooking = {
            _id: bookingId,
            userId: uid || "user_guest",
            parkingSlotId: args.parkingSlotId,
            startTime: args.startTime,
            endTime: args.endTime,
            totalAmount: hours * slot.pricePerHour,
            paymentStatus: "pending",
            bookingStatus: "active",
            vehicleNumber: args.vehicleNumber,
          };
          return {
            ...prev,
            parkingSlots: prev.parkingSlots.map((s) =>
              s._id === args.parkingSlotId
                ? { ...s, availableSlots: Math.max(0, s.availableSlots - 1) }
                : s,
            ),
            bookings: [booking, ...prev.bookings],
          };
        });
        return bookingId;
      }

      if (name === "parking:updatePaymentStatus") {
        setState((prev) => ({
          ...prev,
          bookings: prev.bookings.map((b) =>
            b._id === args.bookingId
              ? { ...b, paymentStatus: args.paymentStatus }
              : b,
          ),
        }));
        return null;
      }

      if (name === "emergency:createEmergencyAlert") {
        const alertId = `alert_${Date.now()}`;
        const alert: LocalEmergencyAlert = {
          _id: alertId,
          type: args.type,
          currentLocation: args.currentLocation,
          destination: args.destination,
          estimatedRoute: [args.currentLocation, args.destination],
          priority: args.priority,
          isActive: true,
          vehicleId: args.vehicleId,
        };
        setState((prev) => ({
          ...prev,
          emergencyAlerts: [alert, ...prev.emergencyAlerts],
        }));
        return alertId;
      }

      if (name === "emergency:deactivateEmergencyAlert") {
        setState((prev) => ({
          ...prev,
          emergencyAlerts: prev.emergencyAlerts.map((a) =>
            a._id === args.alertId ? { ...a, isActive: false } : a,
          ),
        }));
        return null;
      }

      if (name === "chat:sendMessage") {
        const userId = uid || "user_guest";
        let resolvedSessionId = `session_${userId}`;
        setState((prev) => {
          const existing = prev.chatSessions.find(
            (s) => s.userId === userId && s.isActive,
          );
          const msg: LocalChatMessage = {
            role: "user",
            content: args.message,
            timestamp: Date.now(),
          };
          if (!existing) {
            return {
              ...prev,
              chatSessions: [
                ...prev.chatSessions,
                {
                  _id: resolvedSessionId,
                  userId,
                  messages: [msg],
                  isActive: true,
                },
              ],
            };
          }
          resolvedSessionId = existing._id;
          return {
            ...prev,
            chatSessions: prev.chatSessions.map((s) =>
              s._id === existing._id
                ? { ...s, messages: [...s.messages, msg] }
                : s,
            ),
          };
        });
        return resolvedSessionId;
      }

      if (name === "chat:addBotResponse") {
        setState((prev) => ({
          ...prev,
          chatSessions: prev.chatSessions.map((s) =>
            s._id === args.sessionId
              ? {
                  ...s,
                  messages: [
                    ...s.messages,
                    {
                      role: "assistant",
                      content: args.response,
                      timestamp: Date.now(),
                    },
                  ],
                }
              : s,
          ),
        }));
        return null;
      }

      return null;
    },
    [state.communityReports, activeUser],
  );

  const runAction = useCallback(
    async (name: string, args: Record<string, any> = {}) => {
      if (name === "aiChatbot:generateIntelligentResponse" || name === "chat:generateBotResponse") {
        const res = await authFetch("/api/ai/companion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: args.message, context: args.context || {} }),
        });
        const data = await res.json();
        const text = data.reply || data.error || "AI service unavailable.";
        if (name === "chat:generateBotResponse" && args.sessionId) {
          await runMutation("chat:addBotResponse", {
            sessionId: args.sessionId,
            response: text,
          });
        }
        return text;
      }
      return null;
    },
    [runMutation],
  );

  const value = useMemo<LocalContextValue>(
    () => ({
      state,
      authUser,
      activeUser,
      isAuthLoading,
      signIn,
      signOut,
      toggleDriverMode,
      refreshSession,
      runMutation,
      runAction,
    }),
    [
      state,
      authUser,
      activeUser,
      isAuthLoading,
      signIn,
      signOut,
      toggleDriverMode,
      refreshSession,
      runMutation,
      runAction,
    ],
  );

  return (
    <LocalConvexContext.Provider value={value}>
      {children}
    </LocalConvexContext.Provider>
  );
}

export function AppConvexProvider({ children }: { children: ReactNode }) {
  return <UnifiedSmartRoutesProvider>{children}</UnifiedSmartRoutesProvider>;
}

export function Authenticated({ children }: { children: ReactNode }) {
  const ctx = useContext(LocalConvexContext);
  if (ctx?.isAuthLoading) return null;
  return ctx?.activeUser ? <>{children}</> : null;
}

export function Unauthenticated({ children }: { children: ReactNode }) {
  const ctx = useContext(LocalConvexContext);
  if (ctx?.isAuthLoading) return null;
  return !ctx?.activeUser ? <>{children}</> : null;
}

export function useConvexAuth() {
  const ctx = useContext(LocalConvexContext);
  return {
    isLoading: Boolean(ctx?.isAuthLoading),
    isAuthenticated: Boolean(ctx?.activeUser),
  };
}

export function useAuthSession() {
  const ctx = useContext(LocalConvexContext);
  const user = ctx?.authUser ?? null;
  return {
    user,
    role: user?.role ?? null,
    isAuthenticated: Boolean(user),
    isGuest: Boolean(user?.isGuest || user?.role === "guest"),
    isDriver: Boolean(user && user.role === "driver" && !user.isGuest),
    driverModeActive: Boolean(user && user.role === "driver" && user.driverModeActive),
    isLoading: Boolean(ctx?.isAuthLoading),
    toggleDriverMode: ctx?.toggleDriverMode ?? (async () => false),
    refreshSession: ctx?.refreshSession ?? (async () => {}),
  };
}

export function useAuthActions() {
  const ctx = useContext(LocalConvexContext);
  return {
    signIn: async (provider: string, params?: any) => {
      if (!ctx) throw new Error("Authentication provider missing.");
      await ctx.signIn(provider, params);
      return { signingIn: true };
    },
    signOut: async () => {
      await ctx?.signOut();
    },
  };
}

export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgs<Query> | ["skip"]
): FunctionReturnType<Query> | undefined {
  const name = getFunctionName(query);
  const ctx = useContext(LocalConvexContext);
  if (!ctx || args[0] === "skip") {
    return undefined;
  }

  const queryArgs = (args[0] || {}) as Record<string, any>;
  const { state, activeUser, isAuthLoading } = ctx;
  const uid = activeUser?._id;

  switch (name) {
    case "auth:loggedInUser":
      if (isAuthLoading) return undefined;
      return activeUser as any;
    case "journeys:listUserJourneys":
      return (uid ? state.savedJourneys.filter((j) => j.userId === uid) : []) as any;
    case "community:listActiveReports":
      return state.communityReports.filter(
        (r) => r.verificationStatus !== "resolved" && r.expiresAt > Date.now(),
      ) as any;
    case "preferences:getPreferences":
      return (uid ? state.preferencesByUser[uid] || null : null) as any;
    case "preferences:listFavourites":
      return (uid ? state.favourites.filter((f) => f.userId === uid) : []) as any;
    case "routes:getUserRoutes":
      return (uid ? state.routes.filter((r) => r.userId === uid) : []) as any;
    case "routes:getTrafficData":
      return (TRAFFIC_BY_CAMERA[queryArgs.routeSegment] || null) as any;
    case "parking:getParkingSlots":
      return state.parkingSlots.filter((s) => s.isActive) as any;
    case "parking:getUserBookings":
      return (uid ? state.bookings.filter((b) => b.userId === uid) : []).map((b) => ({
        ...b,
        parkingSlot:
          state.parkingSlots.find((s) => s._id === b.parkingSlotId) || null,
      })) as any;
    case "emergency:getActiveEmergencyAlerts":
      return state.emergencyAlerts.filter((a) => a.isActive) as any;
    case "chat:getChatSession": {
      if (!uid) return null as any;
      return (
        state.chatSessions.find((s) => s.userId === uid && s.isActive) || null
      ) as any;
    }
    default:
      return undefined;
  }
}

export function useMutation<Mutation extends FunctionReference<"mutation">>(
  mutation: Mutation,
): (
  ...args: OptionalRestArgs<Mutation>
) => Promise<FunctionReturnType<Mutation>> {
  const name = getFunctionName(mutation);
  const ctx = useContext(LocalConvexContext);
  return useCallback(
    async (...args: any[]) => {
      if (!ctx) throw new Error("SmartRoutes provider missing");
      return ctx.runMutation(name, args[0] || {});
    },
    [ctx, name],
  );
}

export function useAction<Action extends FunctionReference<"action">>(
  action: Action,
): (...args: OptionalRestArgs<Action>) => Promise<FunctionReturnType<Action>> {
  const name = getFunctionName(action);
  const ctx = useContext(LocalConvexContext);
  return useCallback(
    async (...args: any[]) => {
      if (!ctx) throw new Error("SmartRoutes provider missing");
      return ctx.runAction(name, args[0] || {});
    },
    [ctx, name],
  );
}
