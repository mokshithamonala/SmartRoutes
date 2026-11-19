"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";

export const generateIntelligentResponse = action({
  args: {
    message: v.string(),
    context: v.optional(v.object({
      userLocation: v.optional(v.object({
        lat: v.number(),
        lng: v.number(),
      })),
      recentRoutes: v.optional(v.array(v.any())),
      trafficConditions: v.optional(v.string()),
    })),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.CONVEX_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return "Legacy OpenAI assistant is not configured. Use the SmartRoutes 3.0 Gemini AI Driving Companion in the main workspace.";
    }

    try {
      const openai = new OpenAI({
        baseURL: process.env.CONVEX_OPENAI_BASE_URL,
        apiKey,
      });

      const systemPrompt = `You are an AI driving assistant for SmartRoutes. Provide concise, accurate mobility guidance without fabricating live traffic or parking availability.
Current context: ${args.context ? JSON.stringify(args.context) : "No additional context"}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: args.message },
        ],
        max_tokens: 200,
        temperature: 0.5,
      });

      return (
        completion.choices[0]?.message?.content ||
        "I couldn't process your request right now."
      );
    } catch (error) {
      console.error("AI response generation failed:", error);
      return "Unable to reach the legacy AI endpoint. Use the SmartRoutes 3.0 Gemini AI Driving Companion instead.";
    }
  },
});
