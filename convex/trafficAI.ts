"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const analyzeTrafficFromCamera = action({
  args: {
    cameraId: v.string(),
    imageUrl: v.string(),
    routeSegment: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Simulate AI traffic analysis - in production, use computer vision API
      const trafficAnalysis = {
        vehicleCount: Math.floor(Math.random() * 50) + 10,
        averageSpeed: Math.floor(Math.random() * 40) + 20,
        congestionLevel: Math.random() > 0.7 ? "high" : Math.random() > 0.4 ? "medium" : "low",
        emergencyVehicles: Math.random() > 0.9,
        weatherCondition: "clear",
        visibility: "good"
      };

      const congestionScore = trafficAnalysis.vehicleCount > 40 ? 0.8 : 
                             trafficAnalysis.vehicleCount > 25 ? 0.5 : 0.2;

      // Update traffic data
      await ctx.runMutation(internal.routes.updateTrafficData, {
        routeSegment: args.routeSegment,
        trafficLevel: trafficAnalysis.congestionLevel,
        averageSpeed: trafficAnalysis.averageSpeed,
        congestionScore,
        cameraId: args.cameraId,
      });

      return {
        ...trafficAnalysis,
        congestionScore,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("Traffic analysis failed:", error);
      throw new Error("Failed to analyze traffic");
    }
  },
});

export const predictTrafficPatterns = action({
  args: {
    routeId: v.string(),
    timeOfDay: v.number(),
    dayOfWeek: v.number(),
  },
  handler: async (ctx, args) => {
    // Simulate ML-based traffic prediction
    const predictions = [];
    const baseTime = args.timeOfDay;
    
    for (let i = 0; i < 6; i++) {
      const hour = (baseTime + i) % 24;
      let trafficMultiplier = 1;
      
      // Rush hour patterns
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        trafficMultiplier = 1.8;
      } else if (hour >= 22 || hour <= 6) {
        trafficMultiplier = 0.4;
      }
      
      // Weekend patterns
      if (args.dayOfWeek === 0 || args.dayOfWeek === 6) {
        trafficMultiplier *= 0.7;
      }
      
      predictions.push({
        hour,
        expectedDelay: Math.floor(Math.random() * 15 * trafficMultiplier),
        confidence: Math.random() * 0.3 + 0.7,
        trafficLevel: trafficMultiplier > 1.5 ? "high" : trafficMultiplier > 1 ? "medium" : "low"
      });
    }
    
    return predictions;
  },
});
