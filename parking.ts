import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getParkingSlots = query({
  args: {
    lat: v.number(),
    lng: v.number(),
    radius: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // In a real app, you'd filter by location radius
    return await ctx.db.query("parkingSlots").filter((q) => q.eq(q.field("isActive"), true)).collect();
  },
});

export const bookParkingSlot = mutation({
  args: {
    parkingSlotId: v.id("parkingSlots"),
    startTime: v.number(),
    endTime: v.number(),
    vehicleNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const parkingSlot = await ctx.db.get(args.parkingSlotId);
    if (!parkingSlot) throw new Error("Parking slot not found");

    if (parkingSlot.availableSlots <= 0) {
      throw new Error("No available slots");
    }

    const hours = (args.endTime - args.startTime) / (1000 * 60 * 60);
    const totalAmount = hours * parkingSlot.pricePerHour;

    const bookingId = await ctx.db.insert("parkingBookings", {
      userId,
      parkingSlotId: args.parkingSlotId,
      startTime: args.startTime,
      endTime: args.endTime,
      totalAmount,
      paymentStatus: "pending",
      bookingStatus: "active",
      vehicleNumber: args.vehicleNumber,
    });

    // Update available slots
    await ctx.db.patch(args.parkingSlotId, {
      availableSlots: parkingSlot.availableSlots - 1,
    });

    return bookingId;
  },
});

export const getUserBookings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const bookings = await ctx.db
      .query("parkingBookings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return Promise.all(
      bookings.map(async (booking) => {
        const parkingSlot = await ctx.db.get(booking.parkingSlotId);
        return {
          ...booking,
          parkingSlot,
        };
      })
    );
  },
});

export const updatePaymentStatus = mutation({
  args: {
    bookingId: v.id("parkingBookings"),
    paymentStatus: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bookingId, {
      paymentStatus: args.paymentStatus,
    });
  },
});

// Initialize some sample parking data
export const initializeParkingData = mutation({
  args: {},
  handler: async (ctx) => {
    const sampleParkings = [
      {
        name: "City Center Mall Parking",
        location: {
          lat: 40.7128,
          lng: -74.0060,
          address: "123 Main St, New York, NY",
        },
        totalSlots: 200,
        availableSlots: 45,
        pricePerHour: 5,
        amenities: ["CCTV", "Security", "EV Charging"],
        isActive: true,
      },
      {
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

    for (const parking of sampleParkings) {
      await ctx.db.insert("parkingSlots", parking);
    }
  },
});
