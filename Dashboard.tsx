import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { EnhancedRouteOptimizer } from "./EnhancedRouteOptimizer";
import { SmartParkingSystem } from "./SmartParkingSystem";
import { EmergencyAlerts } from "./EmergencyAlerts";
import { EnhancedChatBot } from "./EnhancedChatBot";

export function Dashboard() {
  const [activeTab, setActiveTab] = useState("routes");
  const initializeParkingData = useMutation(api.parking.initializeParkingData);

  useEffect(() => {
    // Initialize parking data on first load
    initializeParkingData().catch(console.error);
  }, [initializeParkingData]);

  const tabs = [
    { id: "routes", label: "AI Route Optimizer", icon: "🗺️", color: "blue" },
    { id: "parking", label: "Smart Parking", icon: "🅿️", color: "green" },
    { id: "emergency", label: "Emergency Alerts", icon: "🚨", color: "red" },
    { id: "chat", label: "AI Assistant", icon: "🤖", color: "purple" },
  ];

  const getTabColors = (tabId: string, isActive: boolean) => {
    const colors = {
      routes: isActive ? "border-blue-600 text-blue-600 bg-blue-50" : "border-transparent text-gray-500 hover:text-blue-600 hover:bg-blue-50",
      parking: isActive ? "border-green-600 text-green-600 bg-green-50" : "border-transparent text-gray-500 hover:text-green-600 hover:bg-green-50",
      emergency: isActive ? "border-red-600 text-red-600 bg-red-50" : "border-transparent text-gray-500 hover:text-red-600 hover:bg-red-50",
      chat: isActive ? "border-purple-600 text-purple-600 bg-purple-50" : "border-transparent text-gray-500 hover:text-purple-600 hover:bg-purple-50",
    };
    return colors[tabId as keyof typeof colors] || colors.routes;
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Enhanced Tab Navigation */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 overflow-hidden">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-3 px-8 py-4 font-medium text-sm whitespace-nowrap border-b-2 transition-all duration-200 transform hover:scale-105 ${getTabColors(tab.id, activeTab === tab.id)}`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Enhanced Tab Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 min-h-[600px]">
        <div className="animate-fadeIn">
          {activeTab === "routes" && <EnhancedRouteOptimizer />}
          {activeTab === "parking" && <SmartParkingSystem />}
          {activeTab === "emergency" && <EmergencyAlerts />}
          {activeTab === "chat" && <EnhancedChatBot />}
        </div>
      </div>

      {/* System Status Bar */}
      <div className="mt-6 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-gray-600">System Status: Online</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-600">Traffic Cameras: 24/25 Active</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-600">AI Processing: Real-time</span>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}
