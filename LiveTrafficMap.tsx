import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function LiveTrafficMap() {
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const trafficData = useQuery(api.routes.getTrafficData, 
    selectedCamera ? { routeSegment: selectedCamera } : "skip"
  );

  const trafficCameras = [
    { id: "cam_001", name: "Main Street & 5th Ave", lat: 40.7128, lng: -74.0060, status: "active" },
    { id: "cam_002", name: "Highway 101 North", lat: 40.7589, lng: -73.9851, status: "active" },
    { id: "cam_003", name: "Downtown Bridge", lat: 40.7505, lng: -73.9934, status: "maintenance" },
    { id: "cam_004", name: "Airport Road", lat: 40.7282, lng: -73.7949, status: "active" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500";
      case "maintenance": return "bg-yellow-500";
      case "offline": return "bg-red-500";
      default: return "bg-gray-500";
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
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Live Traffic Cameras</h3>
        <p className="text-gray-600">Real-time traffic monitoring with AI analysis</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Camera List */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Traffic Cameras</h4>
          {trafficCameras.map((camera) => (
            <div
              key={camera.id}
              onClick={() => setSelectedCamera(camera.id)}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedCamera === camera.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-medium">{camera.name}</h5>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(camera.status)}`}></div>
                  <span className="text-sm text-gray-500 capitalize">{camera.status}</span>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                📍 {camera.lat.toFixed(4)}, {camera.lng.toFixed(4)}
              </p>
              {selectedCamera === camera.id && trafficData && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Traffic Level</p>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTrafficColor(trafficData.trafficLevel)}`}>
                        {trafficData.trafficLevel}
                      </span>
                    </div>
                    <div>
                      <p className="text-gray-500">Avg Speed</p>
                      <p className="font-medium">{trafficData.averageSpeed} km/h</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Camera Feed Simulation */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Live Feed</h4>
          {selectedCamera ? (
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="text-4xl mb-2">📹</div>
                  <p className="text-lg font-medium">Live Traffic Feed</p>
                  <p className="text-sm opacity-75">
                    {trafficCameras.find(c => c.id === selectedCamera)?.name}
                  </p>
                  <div className="mt-4 flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm">LIVE</span>
                  </div>
                </div>
              </div>
              
              {/* AI Analysis Overlay */}
              <div className="p-4 bg-black/50 text-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">🤖 AI Analysis</span>
                  <span className="text-xs opacity-75">Updated 2s ago</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="opacity-75">Vehicles</p>
                    <p className="font-medium">{Math.floor(Math.random() * 20) + 5}</p>
                  </div>
                  <div>
                    <p className="opacity-75">Flow Rate</p>
                    <p className="font-medium">{Math.floor(Math.random() * 100) + 50}/min</p>
                  </div>
                  <div>
                    <p className="opacity-75">Incidents</p>
                    <p className="font-medium">None</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-2">📹</div>
                <p>Select a camera to view live feed</p>
              </div>
            </div>
          )}

          {/* Traffic Analytics */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
            <h5 className="font-medium text-gray-900 mb-3">Traffic Analytics</h5>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Current Congestion</span>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div className="bg-yellow-500 h-2 rounded-full" style={{ width: "60%" }}></div>
                  </div>
                  <span className="text-sm font-medium">60%</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Predicted in 1hr</span>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full" style={{ width: "85%" }}></div>
                  </div>
                  <span className="text-sm font-medium">85%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
