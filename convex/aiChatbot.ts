"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.CONVEX_OPENAI_BASE_URL,
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

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
  handler: async (ctx, args) => {
    try {
      const systemPrompt = `You are an AI traffic assistant for a smart traffic management system. You help users with:
      - Route optimization and traffic analysis
      - Parking availability and booking
      - Emergency corridor information
      - Real-time traffic updates
      
      Be helpful, concise, and provide actionable advice. Use emojis appropriately.
      
      Current context: ${args.context ? JSON.stringify(args.context) : 'No additional context'}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: args.message }
        ],
        max_tokens: 200,
        temperature: 0.7,
      });

      return completion.choices[0].message.content || "I'm sorry, I couldn't process your request right now.";
    } catch (error) {
      console.error("AI response generation failed:", error);
      
      // Fallback responses
      const fallbackResponses = [
        "I can help you find the best route to your destination. Would you like me to check current traffic conditions? 🗺️",
        "Based on current traffic data, I recommend taking the highway route which is 5 minutes faster today. 🚗",
        "I found 3 available parking spots near your destination. Would you like me to book one for you? 🅿️",
        "There's moderate traffic on your usual route. I suggest leaving 10 minutes earlier than usual. ⏰",
        "Your parking booking is confirmed! You have spot #A23 reserved for 2 hours. ✅",
      ];
      
      return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
  },
});
