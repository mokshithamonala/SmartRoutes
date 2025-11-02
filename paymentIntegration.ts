"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const createPaymentIntent = action({
  args: {
    amount: v.number(),
    currency: v.string(),
    bookingId: v.id("parkingBookings"),
  },
  handler: async (ctx, args) => {
    // In production, integrate with Stripe or other payment processor
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      // Simulate payment for demo
      return {
        clientSecret: `pi_demo_${Date.now()}`,
        paymentIntentId: `pi_${Math.random().toString(36).substr(2, 9)}`,
        status: "requires_payment_method",
      };
    }

    try {
      // Stripe integration would go here
      const response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          amount: (args.amount * 100).toString(), // Convert to cents
          currency: args.currency,
          metadata: JSON.stringify({ bookingId: args.bookingId }),
        }),
      });

      const paymentIntent = await response.json();
      
      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
    } catch (error) {
      console.error("Payment creation failed:", error);
      throw new Error("Failed to create payment");
    }
  },
});

export const confirmPayment = action({
  args: {
    paymentIntentId: v.string(),
    bookingId: v.id("parkingBookings"),
  },
  handler: async (ctx, args) => {
    // Simulate payment confirmation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Update booking status
    await ctx.runMutation(api.parking.updatePaymentStatus, {
      bookingId: args.bookingId,
      paymentStatus: "paid",
    });
    
    return {
      status: "succeeded",
      receiptUrl: `https://receipt.example.com/${args.paymentIntentId}`,
    };
  },
});
