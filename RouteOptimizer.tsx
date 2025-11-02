import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export function RouteOptimizer() {
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);

  const planRoute = useMutation(api.routes.planRoute);
  const userRoutes = useQuery(api.routes.getUserRoutes) || [];

  const handlePlanRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startLocation || !endLocation) return;

    setIsPlanning(true);
    try {
      // Simulate geocoding - in production, use Google Maps API
      const start = {
        lat: 40.7128 + Math.random() * 0.01,
        lng: -74.0060 + Math.random() * 0.01,
        address: startLocation,
      };
      const end = {
        lat: 40.7589 + Math.random() * 0.01,
        lng: -73.9851 + Math.random() * 0.01,
        address: endLocation,
      };

      await planRoute({ startLocation: start, endLocation: end });
      toast.success("Route planned successfully!");
      setStartLocation("");
      setEndLocation("");
    } catch (error) {
      toast.error("Failed to plan route");
    } finally {
      setIsPlanning(false);
    }
  };

  const getTrafficColor = (level: string) => {
    switch (level) {
      case "low": return "text-green-600 bg-green-100";
      case "medium": return "text-yellow-600 bg-yellow-100";
      case "high": return "text-red-600 bg-red-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Route Optimizer</h2>
        <p className="text-gray-600">Find the best route with real-time traffic analysis</p>
      </div>

      {/* Route Planning Form */}
      <form onSubmit={handlePlanRoute} className="bg-gray-50 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              From
            </label>
            <input
              type="text"
              value={startLocation}
              onChange={(e) => setStartLocation(e.target.value)}
              placeholder="Enter starting location"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              To
            </label>
            <input
              type="text"
              value={endLocation}
              onChange={(e) => setEndLocation(e.target.value)}
              placeholder="Enter destination"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isPlanning || !startLocation || !endLocation}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPlanning ? "Planning Route..." : "Plan Route"}
        </button>
      </form>

      {/* Recent Routes */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Routes</h3>
        {userRoutes.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No routes planned yet</p>
        ) : (
          <div className="space-y-4">
            {userRoutes.map((route) => (
              <div key={route._id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {route.startLocation.address} → {route.endLocation.address}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(route._creationTime).toLocaleString()}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    route.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                  }`}>
                    {route.status}
                  </span>
                </div>
                
                <div className="space-y-2">
                  {route.routeOptions.map((option, index) => (
                    <div key={option.routeId} className={`p-3 rounded-lg border ${
                      option.isRecommended ? "border-blue-200 bg-blue-50" : "border-gray-200"
                    }`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-4">
                          <span className="font-medium">Route {index + 1}</span>
                          {option.isRecommended && (
                            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                              Recommended
                            </span>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTrafficColor(option.trafficLevel)}`}>
                          {option.trafficLevel} traffic
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                        <span>🕒 {option.estimatedTime} min</span>
                        <span>📏 {option.distance} km</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
