"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

export const getOptimizedRoutes = action({
  args: {
    origin: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    destination: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    preferences: v.optional(v.object({
      avoidTolls: v.boolean(),
      avoidHighways: v.boolean(),
      routeType: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // In production, integrate with Google Maps Directions API
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      // Fallback to simulated data for demo
      return generateSimulatedRoutes(args.origin, args.destination);
    }

    try {
      const params = new URLSearchParams({
        origin: `${args.origin.lat},${args.origin.lng}`,
        destination: `${args.destination.lat},${args.destination.lng}`,
        alternatives: 'true',
        key: apiKey,
        departure_time: 'now',
        traffic_model: 'best_guess',
      });

      if (args.preferences?.avoidTolls) params.append('avoid', 'tolls');
      if (args.preferences?.avoidHighways) params.append('avoid', 'highways');

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?${params}`
      );
      
      const data = await response.json();
      
      if (data.status === 'OK') {
        return data.routes.map((route: any, index: number) => ({
          routeId: `route_${index + 1}`,
          distance: route.legs[0].distance.value / 1000, // Convert to km
          estimatedTime: Math.ceil(route.legs[0].duration_in_traffic?.value / 60) || Math.ceil(route.legs[0].duration.value / 60),
          trafficLevel: getTrafficLevel(route.legs[0].duration_in_traffic?.value, route.legs[0].duration.value),
          polyline: route.overview_polyline.points,
          waypoints: decodePolyline(route.overview_polyline.points),
          isRecommended: index === 0,
          tollInfo: route.fare ? { amount: route.fare.value, currency: route.fare.currency } : null,
        }));
      }
    } catch (error) {
      console.error("Google Maps API error:", error);
    }
    
    return generateSimulatedRoutes(args.origin, args.destination);
  },
});

function generateSimulatedRoutes(origin: any, destination: any) {
  const distance = calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng);
  
  return [
    {
      routeId: "route_1",
      distance: distance,
      estimatedTime: Math.ceil(distance / 0.8), // Assuming 48 km/h average
      trafficLevel: "low",
      waypoints: [origin, destination],
      isRecommended: true,
      tollInfo: null,
    },
    {
      routeId: "route_2",
      distance: distance * 1.2,
      estimatedTime: Math.ceil(distance * 1.2 / 0.6), // Slower route
      trafficLevel: "medium",
      waypoints: [origin, destination],
      isRecommended: false,
      tollInfo: { amount: 5.50, currency: "USD" },
    },
  ];
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getTrafficLevel(trafficDuration: number, normalDuration: number) {
  if (!trafficDuration) return "low";
  const ratio = trafficDuration / normalDuration;
  if (ratio > 1.5) return "high";
  if (ratio > 1.2) return "medium";
  return "low";
}

function decodePolyline(encoded: string) {
  // Simplified polyline decoder - in production use a proper library
  return []; // Return decoded waypoints
}
