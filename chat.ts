import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getChatSession = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("chatSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
  },
});

export const sendMessage = mutation({
  args: {
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    let session = await ctx.db
      .query("chatSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    const userMessage = {
      role: "user",
      content: args.message,
      timestamp: Date.now(),
    };

    if (!session) {
      const sessionId = await ctx.db.insert("chatSessions", {
        userId,
        messages: [userMessage],
        isActive: true,
      });
      return sessionId;
    } else {
      await ctx.db.patch(session._id, {
        messages: [...session.messages, userMessage],
      });
      return session._id;
    }
  },
});

export const addBotResponse = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const botMessage = {
      role: "assistant",
      content: args.response,
      timestamp: Date.now(),
    };

    await ctx.db.patch(args.sessionId, {
      messages: [...session.messages, botMessage],
    });
  },
});

export const generateBotResponse = action({
  args: {
    message: v.string(),
    sessionId: v.id("chatSessions"),
  },
  handler: async (ctx, args) => {
    // Simulate AI response - in production, integrate with OpenAI
    const responses = [
      "I can help you find the best route to your destination. Would you like me to check current traffic conditions?",
      "Based on current traffic data, I recommend taking the highway route which is 5 minutes faster today.",
      "I found 3 available parking spots near your destination. Would you like me to book one for you?",
      "There's an emergency vehicle approaching your route. Please move to the right lane when safe.",
      "Your parking booking is confirmed! You have spot #A23 reserved for 2 hours.",
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    await ctx.runMutation(api.chat.addBotResponse, {
      sessionId: args.sessionId,
      response: randomResponse,
    });

    return randomResponse;
  },
});
