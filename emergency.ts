import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const createEmergencyAlert = mutation({
  args: {
    type: v.string(),
    currentLocation: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    destination: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    vehicleId: v.string(),
    priority: v.string(),
  },
  handler: async (ctx, args) => {
    const estimatedRoute = [
      args.currentLocation,
      args.destination,
    ];

    return await ctx.db.insert("emergencyAlerts", {
      type: args.type,
      currentLocation: args.currentLocation,
      destination: args.destination,
      estimatedRoute,
      priority: args.priority,
      isActive: true,
      vehicleId: args.vehicleId,
    });
  },
});

export const getActiveEmergencyAlerts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("emergencyAlerts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

export const deactivateEmergencyAlert = mutation({
  args: { alertId: v.id("emergencyAlerts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, {
      isActive: false,
    });
  },
});
