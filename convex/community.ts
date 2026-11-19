import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

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

export const listActiveReports = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = await ctx.db.query("communityReports").order("desc").take(80);
    return all.filter(
      (r) => r.verificationStatus !== "resolved" && r.expiresAt > now,
    );
  },
});

export const submitReport = mutation({
  args: {
    type: v.string(),
    lat: v.number(),
    lng: v.number(),
    address: v.string(),
    description: v.string(),
    severity: v.string(),
    ttlHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const now = Date.now();
    if (!args.description.trim() || args.description.trim().length < 4) {
      throw new Error("Please provide a brief description (at least 4 characters).");
    }

    // Rate limit: max 5 reports per user in 10 minutes
    const recentByUser = await ctx.db
      .query("communityReports")
      .withIndex("by_creator", (q) => q.eq("createdBy", userId))
      .order("desc")
      .take(10);
    const inWindow = recentByUser.filter((r) => now - r.createdAt < 10 * 60 * 1000);
    if (inWindow.length >= 5) {
      throw new Error("Rate limit reached: please wait before submitting additional reports.");
    }

    // Duplicate detection within 200m for same report type
    const active = await ctx.db.query("communityReports").order("desc").take(50);
    const duplicate = active.find(
      (r) =>
        r.verificationStatus !== "resolved" &&
        r.expiresAt > now &&
        r.type === args.type &&
        approxDistKm(r.lat, r.lng, args.lat, args.lng) < 0.2,
    );
    if (duplicate) {
      const uidStr = String(userId);
      const alreadyConfirmed = duplicate.confirmedBy.includes(uidStr);
      if (!alreadyConfirmed) {
        const nextConfirmedBy = [...duplicate.confirmedBy, uidStr];
        await ctx.db.patch(duplicate._id, {
          confirmations: duplicate.confirmations + 1,
          confirmedBy: nextConfirmedBy,
          verificationStatus:
            duplicate.confirmations + 1 >= 2 ? "confirmed" : duplicate.verificationStatus,
        });
      }
      return { reportId: duplicate._id, mergedDuplicate: true };
    }

    const ttlMs = Math.min(Math.max(args.ttlHours || 6, 1), 72) * 3600 * 1000;
    const reportId = await ctx.db.insert("communityReports", {
      type: args.type,
      lat: args.lat,
      lng: args.lng,
      address: args.address,
      description: args.description.trim(),
      severity: args.severity,
      dataSource: "community",
      verificationStatus: "unverified",
      confirmations: 1,
      confirmedBy: [String(userId)],
      flaggedBy: [],
      createdBy: userId,
      createdAt: now,
      expiresAt: now + ttlMs,
    });

    return { reportId, mergedDuplicate: false };
  },
});

export const confirmReport = mutation({
  args: { reportId: v.id("communityReports") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");

    const uidStr = String(userId);
    if (report.confirmedBy.includes(uidStr)) return;

    const confirmations = report.confirmations + 1;
    await ctx.db.patch(args.reportId, {
      confirmations,
      confirmedBy: [...report.confirmedBy, uidStr],
      verificationStatus: confirmations >= 2 ? "confirmed" : report.verificationStatus,
    });
  },
});

export const flagReport = mutation({
  args: { reportId: v.id("communityReports") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");

    const uidStr = String(userId);
    if (report.flaggedBy.includes(uidStr)) return;

    const nextFlagged = [...report.flaggedBy, uidStr];
    await ctx.db.patch(args.reportId, {
      flaggedBy: nextFlagged,
      verificationStatus: nextFlagged.length >= 2 ? "flagged" : report.verificationStatus,
    });
  },
});

export const resolveReport = mutation({
  args: { reportId: v.id("communityReports") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");
    if (report.createdBy !== userId) {
      throw new Error("Only the report creator can resolve this report.");
    }
    await ctx.db.patch(args.reportId, {
      verificationStatus: "resolved",
    });
  },
});
