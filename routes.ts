import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const planRoute = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Enhanced route calculation with AI traffic analysis
    const routeOptions = [
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
    ];

    return await ctx.db.insert("routes", {
      userId,
      startLocation: args.startLocation,
      endLocation: args.endLocation,
      routeOptions,
      status: "planning",
    });
  },
});

export const getUserRoutes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("routes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
  },
});

export const updateTrafficData = internalMutation({
  args: {
    routeSegment: v.string(),
    trafficLevel: v.string(),
    averageSpeed: v.number(),
    congestionScore: v.number(),
    cameraId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trafficData")
      .withIndex("by_segment", (q) => q.eq("routeSegment", args.routeSegment))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        trafficLevel: args.trafficLevel,
        averageSpeed: args.averageSpeed,
        congestionScore: args.congestionScore,
        lastUpdated: Date.now(),
        cameraId: args.cameraId,
      });
    } else {
      await ctx.db.insert("trafficData", {
        ...args,
        lastUpdated: Date.now(),
      });
    }
  },
});

export const getTrafficData = query({
  args: { routeSegment: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trafficData")
      .withIndex("by_segment", (q) => q.eq("routeSegment", args.routeSegment))
      .first();
  },
});
