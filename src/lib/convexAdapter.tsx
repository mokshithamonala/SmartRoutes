import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Authenticated as RealAuthenticated,
  Unauthenticated as RealUnauthenticated,
  ConvexReactClient,
  useConvexAuth as useRealConvexAuth,
  useQuery as useRealQuery,
  useMutation as useRealMutation,
  useAction as useRealAction,
} from "convex/react";
import {
  ConvexAuthProvider,
  useAuthActions as useRealAuthActions,
} from "@convex-dev/auth/react";
import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
  type OptionalRestArgs,
} from "convex/server";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;
const USE_REAL_CONVEX = Boolean(
  CONVEX_URL && /^https?:\/\//.test(CONVEX_URL.trim()),
);

const realConvexClient = USE_REAL_CONVEX
  ? new ConvexReactClient(CONVEX_URL!.trim())
  : null;

// --- In-memory local runtime when VITE_CONVEX_URL is not configured ---

interface LocalUser {
  _id: string;
  email?: string;
  name: string;
  isAnonymous?: boolean;
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
  user: LocalUser | null;
  routes: LocalRoute[];
  parkingSlots: LocalParkingSlot[];
  bookings: LocalBooking[];
  emergencyAlerts: LocalEmergencyAlert[];
  chatSessions: LocalChatSession[];
}

const INITIAL_PARKING_SLOTS: LocalParkingSlot[] = [
  {
    _id: "parking_1",
    name: "City Center Mall Parking",
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
    name: "Downtown Business District",
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

interface LocalContextValue {
  state: LocalStoreState;
  signIn: (provider: string, params?: FormData | Record<string, unknown>) => Promise<void>;
  signOut: () => Promise<void>;
  runMutation: (name: string, args: Record<string, any>) => Promise<any>;
  runAction: (name: string, args: Record<string, any>) => Promise<any>;
}

const LocalConvexContext = createContext<LocalContextValue | null>(null);

function LocalConvexProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocalStoreState>({
    user: null,
    routes: [],
    parkingSlots: INITIAL_PARKING_SLOTS,
    bookings: [],
    emergencyAlerts: [],
    chatSessions: [],
  });

  const signIn = useCallback(
    async (provider: string, params?: FormData | Record<string, unknown>) => {
      if (provider === "anonymous") {
        setState((prev) => ({
          ...prev,
          user: {
            _id: "user_anon",
            name: "Guest User",
            isAnonymous: true,
          },
        }));
        return;
      }

      const email =
        params instanceof FormData
          ? String(params.get("email") || "user@smarttraffic.local")
          : String((params as Record<string, unknown>)?.email || "user@smarttraffic.local");

      setState((prev) => ({
        ...prev,
        user: {
          _id: `user_${email}`,
          email,
          name: email.split("@")[0],
          isAnonymous: false,
        },
      }));
    },
    [],
  );

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, user: null }));
  }, []);

  const runMutation = useCallback(
    async (name: string, args: Record<string, any> = {}) => {
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
          userId: state.user?._id || "user_anon",
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
            {
              routeId: "route_2",
              distance: 18.7,
              estimatedTime: 22,
              trafficLevel: "medium",
              waypoints: [
                { lat: args.startLocation.lat, lng: args.startLocation.lng },
                { lat: args.endLocation.lat, lng: args.endLocation.lng },
              ],
              isRecommended: false,
            },
            {
              routeId: "route_3",
              distance: 12.8,
              estimatedTime: 35,
              trafficLevel: "high",
              waypoints: [
                { lat: args.startLocation.lat, lng: args.startLocation.lng },
                { lat: args.endLocation.lat, lng: args.endLocation.lng },
              ],
              isRecommended: false,
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
            userId: prev.user?._id || "user_anon",
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
        const userId = state.user?._id || "user_anon";
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
    [state.user],
  );

  const runAction = useCallback(
    async (name: string, args: Record<string, any> = {}) => {
      const prompt = String(args.message || "").toLowerCase();
      let reply =
        "I can help you optimize routes, check available parking, monitor traffic cameras, or manage emergency corridors. What would you like to do? 🗺️";

      if (prompt.includes("parking")) {
        const totalAvail = state.parkingSlots.reduce(
          (sum, s) => sum + s.availableSlots,
          0,
        );
        reply = `There are currently ${totalAvail} parking spots available across ${state.parkingSlots.length} nearby locations. City Center Mall Parking ($5/hr) has the most availability right now. 🅿️`;
      } else if (prompt.includes("route") || prompt.includes("fastest") || prompt.includes("fuel") || prompt.includes("eco")) {
        reply =
          "Route 1 is currently recommended with low congestion (~25 min, 15.2 km). You can also switch to Eco-Friendly mode in the AI Route Optimizer tab to minimize fuel usage. 🚀";
      } else if (prompt.includes("emergency") || prompt.includes("ambulance")) {
        const activeCount = state.emergencyAlerts.filter((a) => a.isActive).length;
        reply =
          activeCount > 0
            ? `There ${activeCount === 1 ? "is" : "are"} currently ${activeCount} active emergency corridor alert${activeCount === 1 ? "" : "s"}. Please keep the rightmost lane clear. 🚨`
            : "There are no active emergency corridor alerts right now. You can activate one anytime in the Emergency Alerts tab. ✅";
      } else if (prompt.includes("traffic") || prompt.includes("time")) {
        reply =
          "Current corridor congestion is moderate (~60%). Highway 101 North is flowing smoothly at ~62 km/h while Downtown Bridge has heavier delays. 🚦";
      }

      if (name === "chat:generateBotResponse" && args.sessionId) {
        await runMutation("chat:addBotResponse", {
          sessionId: args.sessionId,
          response: reply,
        });
      }

      return reply;
    },
    [runMutation, state.emergencyAlerts, state.parkingSlots],
  );

  const value = useMemo(
    () => ({ state, signIn, signOut, runMutation, runAction }),
    [state, signIn, signOut, runMutation, runAction],
  );

  return (
    <LocalConvexContext.Provider value={value}>
      {children}
    </LocalConvexContext.Provider>
  );
}

export function AppConvexProvider({ children }: { children: ReactNode }) {
  if (USE_REAL_CONVEX && realConvexClient) {
    return (
      <ConvexAuthProvider client={realConvexClient}>
        {children}
      </ConvexAuthProvider>
    );
  }
  return <LocalConvexProvider>{children}</LocalConvexProvider>;
}

export function Authenticated({ children }: { children: ReactNode }) {
  if (USE_REAL_CONVEX) {
    return <RealAuthenticated>{children}</RealAuthenticated>;
  }
  const ctx = useContext(LocalConvexContext);
  return ctx?.state.user ? <>{children}</> : null;
}

export function Unauthenticated({ children }: { children: ReactNode }) {
  if (USE_REAL_CONVEX) {
    return <RealUnauthenticated>{children}</RealUnauthenticated>;
  }
  const ctx = useContext(LocalConvexContext);
  return !ctx?.state.user ? <>{children}</> : null;
}

export function useConvexAuth() {
  if (USE_REAL_CONVEX) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRealConvexAuth();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = useContext(LocalConvexContext);
  return {
    isLoading: false,
    isAuthenticated: Boolean(ctx?.state.user),
  };
}

export function useAuthActions() {
  if (USE_REAL_CONVEX) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRealAuthActions();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = useContext(LocalConvexContext);
  return {
    signIn: async (provider: string, params?: any) => {
      await ctx?.signIn(provider, params);
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
  if (USE_REAL_CONVEX) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRealQuery(query, ...(args as any));
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = useContext(LocalConvexContext);
  if (!ctx || args[0] === "skip") {
    return undefined;
  }

  const name = getFunctionName(query);
  const queryArgs = (args[0] || {}) as Record<string, any>;
  const { state } = ctx;

  switch (name) {
    case "auth:loggedInUser":
      return state.user as any;
    case "routes:getUserRoutes":
      return state.routes as any;
    case "routes:getTrafficData":
      return (TRAFFIC_BY_CAMERA[queryArgs.routeSegment] || null) as any;
    case "parking:getParkingSlots":
      return state.parkingSlots.filter((s) => s.isActive) as any;
    case "parking:getUserBookings":
      return state.bookings.map((b) => ({
        ...b,
        parkingSlot:
          state.parkingSlots.find((s) => s._id === b.parkingSlotId) || null,
      })) as any;
    case "emergency:getActiveEmergencyAlerts":
      return state.emergencyAlerts.filter((a) => a.isActive) as any;
    case "chat:getChatSession": {
      const userId = state.user?._id;
      if (!userId) return null as any;
      return (
        state.chatSessions.find((s) => s.userId === userId && s.isActive) ||
        null
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
  if (USE_REAL_CONVEX) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRealMutation(mutation) as any;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = useContext(LocalConvexContext);
  const name = getFunctionName(mutation);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCallback(
    async (...args: any[]) => {
      if (!ctx) throw new Error("LocalConvexProvider missing");
      return ctx.runMutation(name, args[0] || {});
    },
    [ctx, name],
  );
}

export function useAction<Action extends FunctionReference<"action">>(
  action: Action,
): (...args: OptionalRestArgs<Action>) => Promise<FunctionReturnType<Action>> {
  if (USE_REAL_CONVEX) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRealAction(action) as any;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = useContext(LocalConvexContext);
  const name = getFunctionName(action);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCallback(
    async (...args: any[]) => {
      if (!ctx) throw new Error("LocalConvexProvider missing");
      return ctx.runAction(name, args[0] || {});
    },
    [ctx, name],
  );
}
