import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
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
    routeOptions: v.array(v.object({
      routeId: v.string(),
      distance: v.number(),
      estimatedTime: v.number(),
      trafficLevel: v.string(), // "low", "medium", "high"
      waypoints: v.array(v.object({
        lat: v.number(),
        lng: v.number(),
      })),
      isRecommended: v.boolean(),
    })),
    status: v.string(), // "planning", "active", "completed"
  }).index("by_user", ["userId"]),

  trafficData: defineTable({
    routeSegment: v.string(),
    trafficLevel: v.string(), // "low", "medium", "high", "blocked"
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
    paymentStatus: v.string(), // "pending", "paid", "failed", "refunded"
    bookingStatus: v.string(), // "active", "completed", "cancelled"
    vehicleNumber: v.string(),
    slotNumber: v.optional(v.string()),
  }).index("by_user", ["userId"])
    .index("by_parking", ["parkingSlotId"])
    .index("by_status", ["bookingStatus"]),

  emergencyAlerts: defineTable({
    type: v.string(), // "ambulance", "fire", "police"
    currentLocation: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    destination: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    estimatedRoute: v.array(v.object({
      lat: v.number(),
      lng: v.number(),
    })),
    priority: v.string(), // "high", "critical"
    isActive: v.boolean(),
    vehicleId: v.string(),
  }).index("by_active", ["isActive"]),

  chatSessions: defineTable({
    userId: v.id("users"),
    messages: v.array(v.object({
      role: v.string(), // "user", "assistant"
      content: v.string(),
      timestamp: v.number(),
    })),
    isActive: v.boolean(),
  }).index("by_user", ["userId"]),

  userPreferences: defineTable({
    userId: v.id("users"),
    preferredRouteType: v.string(), // "fastest", "shortest", "eco-friendly"
    avoidTolls: v.boolean(),
    avoidHighways: v.boolean(),
    vehicleType: v.string(), // "car", "bike", "truck"
    notificationsEnabled: v.boolean(),
  }).index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
