import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const savePreferences = mutation({
  args: {
    preferredRouteType: v.string(),
    avoidTolls: v.boolean(),
    avoidHighways: v.boolean(),
    vehicleType: v.string(),
    notificationsEnabled: v.boolean(),
    parkingPreference: v.optional(v.string()),
    accessibilityNeeds: v.optional(v.boolean()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("userPreferences", { userId, ...args });
  },
});

export const listFavourites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("favouriteDestinations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const addFavourite = mutation({
  args: {
    label: v.string(),
    address: v.string(),
    lat: v.number(),
    lng: v.number(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("favouriteDestinations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (
      existing.some(
        (f) =>
          f.label.toLowerCase() === args.label.trim().toLowerCase() &&
          Math.abs(f.lat - args.lat) < 0.001,
      )
    ) {
      throw new Error("This favourite destination is already saved.");
    }

    return await ctx.db.insert("favouriteDestinations", {
      userId,
      label: args.label.trim(),
      address: args.address,
      lat: args.lat,
      lng: args.lng,
      category: args.category,
      createdAt: Date.now(),
    });
  },
});

export const removeFavourite = mutation({
  args: { favouriteId: v.id("favouriteDestinations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db.get(args.favouriteId);
    if (!existing || existing.userId !== userId) {
      throw new Error("Favourite not found or access denied");
    }
    await ctx.db.delete(args.favouriteId);
  },
});

export const deleteAllPersonalData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const [journeys, favs, prefs, chats] = await Promise.all([
      ctx.db
        .query("savedJourneys")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("favouriteDestinations")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("chatSessions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    for (const j of journeys) await ctx.db.delete(j._id);
    for (const f of favs) await ctx.db.delete(f._id);
    for (const p of prefs) await ctx.db.delete(p._id);
    for (const c of chats) await ctx.db.delete(c._id);
  },
});
