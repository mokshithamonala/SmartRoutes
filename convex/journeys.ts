import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const geoPointValidator = v.object({
  lat: v.number(),
  lng: v.number(),
  address: v.string(),
  label: v.optional(v.string()),
});

const waypointValidator = v.object({
  id: v.string(),
  lat: v.number(),
  lng: v.number(),
  address: v.string(),
  label: v.optional(v.string()),
  category: v.optional(v.string()),
  source: v.optional(v.string()),
});

export const listUserJourneys = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("savedJourneys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(40);
  },
});

export const saveJourney = mutation({
  args: {
    name: v.string(),
    origin: geoPointValidator,
    destination: geoPointValidator,
    waypoints: v.array(waypointValidator),
    selectedRouteId: v.string(),
    distanceKm: v.number(),
    durationMin: v.number(),
    turnCount: v.number(),
    qualityScore: v.number(),
    routeType: v.string(),
    geometry: v.array(v.array(v.number())),
    aiSummary: v.optional(v.string()),
    isEmergency: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.db.insert("savedJourneys", {
      userId,
      ...args,
    });
  },
});

export const updateJourneyStops = mutation({
  args: {
    journeyId: v.id("savedJourneys"),
    waypoints: v.array(waypointValidator),
    distanceKm: v.number(),
    durationMin: v.number(),
    turnCount: v.number(),
    qualityScore: v.number(),
    geometry: v.array(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db.get(args.journeyId);
    if (!existing || existing.userId !== userId) {
      throw new Error("Journey not found or access denied");
    }

    await ctx.db.patch(args.journeyId, {
      waypoints: args.waypoints,
      distanceKm: args.distanceKm,
      durationMin: args.durationMin,
      turnCount: args.turnCount,
      qualityScore: args.qualityScore,
      geometry: args.geometry,
    });
  },
});

export const deleteJourney = mutation({
  args: { journeyId: v.id("savedJourneys") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db.get(args.journeyId);
    if (!existing || existing.userId !== userId) {
      throw new Error("Journey not found or access denied");
    }
    await ctx.db.delete(args.journeyId);
  },
});
