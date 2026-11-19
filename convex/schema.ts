import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  // Preserved existing tables
  routes: defineTable({
    userId: v.id("users"),
    startLocation: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.string(),
    }),
    endLocation: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.string(),
    }),
    routeOptions: v.array(
      v.object({
        routeId: v.string(),
        distance: v.number(),
        estimatedTime: v.number(),
        trafficLevel: v.string(),
        waypoints: v.array(
          v.object({
            lat: v.number(),
            lng: v.number(),
          }),
        ),
        isRecommended: v.boolean(),
      }),
    ),
    status: v.string(),
  }).index("by_user", ["userId"]),

  trafficData: defineTable({
    routeSegment: v.string(),
    trafficLevel: v.string(),
    averageSpeed: v.number(),
    congestionScore: v.number(),
    lastUpdated: v.number(),
    cameraId: v.optional(v.string()),
  }).index("by_segment", ["routeSegment"]),

  parkingSlots: defineTable({
    name: v.string(),
    location: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.string(),
    }),
    totalSlots: v.number(),
    availableSlots: v.number(),
    pricePerHour: v.number(),
    amenities: v.array(v.string()),
    isActive: v.boolean(),
  }).index("by_location", ["location.lat", "location.lng"]),

  parkingBookings: defineTable({
    userId: v.id("users"),
    parkingSlotId: v.id("parkingSlots"),
    startTime: v.number(),
    endTime: v.number(),
    totalAmount: v.number(),
    paymentStatus: v.string(),
    bookingStatus: v.string(),
    vehicleNumber: v.string(),
    slotNumber: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_parking", ["parkingSlotId"])
    .index("by_status", ["bookingStatus"]),

  emergencyAlerts: defineTable({
    type: v.string(),
    currentLocation: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    destination: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    estimatedRoute: v.array(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    priority: v.string(),
    isActive: v.boolean(),
    vehicleId: v.string(),
  }).index("by_active", ["isActive"]),

  chatSessions: defineTable({
    userId: v.id("users"),
    messages: v.array(
      v.object({
        role: v.string(),
        content: v.string(),
        timestamp: v.number(),
      }),
    ),
    isActive: v.boolean(),
  }).index("by_user", ["userId"]),

  userPreferences: defineTable({
    userId: v.id("users"),
    preferredRouteType: v.string(),
    avoidTolls: v.boolean(),
    avoidHighways: v.boolean(),
    vehicleType: v.string(),
    notificationsEnabled: v.boolean(),
    parkingPreference: v.optional(v.string()),
    accessibilityNeeds: v.optional(v.boolean()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // SmartRoutes 3.0 extended tables
  savedJourneys: defineTable({
    userId: v.id("users"),
    name: v.string(),
    origin: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.string(),
      label: v.optional(v.string()),
    }),
    destination: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.string(),
      label: v.optional(v.string()),
    }),
    waypoints: v.array(
      v.object({
        id: v.string(),
        lat: v.number(),
        lng: v.number(),
        address: v.string(),
        label: v.optional(v.string()),
        category: v.optional(v.string()),
        source: v.optional(v.string()),
      }),
    ),
    selectedRouteId: v.string(),
    distanceKm: v.number(),
    durationMin: v.number(),
    turnCount: v.number(),
    qualityScore: v.number(),
    routeType: v.string(),
    geometry: v.array(v.array(v.number())),
    aiSummary: v.optional(v.string()),
    isEmergency: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  communityReports: defineTable({
    type: v.string(),
    lat: v.number(),
    lng: v.number(),
    address: v.string(),
    description: v.string(),
    severity: v.string(),
    dataSource: v.string(),
    verificationStatus: v.string(),
    confirmations: v.number(),
    confirmedBy: v.array(v.string()),
    flaggedBy: v.array(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_status", ["verificationStatus"])
    .index("by_creator", ["createdBy"]),

  favouriteDestinations: defineTable({
    userId: v.id("users"),
    label: v.string(),
    address: v.string(),
    lat: v.number(),
    lng: v.number(),
    category: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
