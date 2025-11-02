import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export function EmergencyAlerts() {
  const [newAlert, setNewAlert] = useState({
    type: "ambulance",
    vehicleId: "",
    priority: "high",
  });

  const activeAlerts = useQuery(api.emergency.getActiveEmergencyAlerts) || [];
  const createAlert = useMutation(api.emergency.createEmergencyAlert);
  const deactivateAlert = useMutation(api.emergency.deactivateEmergencyAlert);

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlert.vehicleId) return;

    try {
      // Simulate current location and destination
      const currentLocation = {
        lat: 40.7128 + Math.random() * 0.01,
        lng: -74.0060 + Math.random() * 0.01,
      };
      const destination = {
        lat: 40.7589 + Math.random() * 0.01,
        lng: -73.9851 + Math.random() * 0.01,
      };

      await createAlert({
        type: newAlert.type,
        currentLocation,
        destination,
        vehicleId: newAlert.vehicleId,
        priority: newAlert.priority,
      });

      toast.success("Emergency alert created! Green corridor activated.");
      setNewAlert({ type: "ambulance", vehicleId: "", priority: "high" });
    } catch (error) {
      toast.error("Failed to create emergency alert");
    }
  };

  const handleDeactivateAlert = async (alertId: string) => {
    try {
      await deactivateAlert({ alertId: alertId as any });
      toast.success("Emergency alert deactivated");
    } catch (error) {
      toast.error("Failed to deactivate alert");
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "ambulance": return "🚑";
      case "fire": return "🚒";
      case "police": return "🚓";
      default: return "🚨";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-red-100 text-red-800 border-red-200";
      case "high": return "bg-orange-100 text-orange-800 border-orange-200";
      default: return "bg-yellow-100 text-yellow-800 border-yellow-200";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Emergency Corridor Management</h2>
        <p className="text-gray-600">Manage emergency vehicle alerts and green corridor notifications</p>
      </div>

      {/* Create Alert Form */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-900 mb-4">Create Emergency Alert</h3>
        <form onSubmit={handleCreateAlert} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Emergency Type
              </label>
              <select
                value={newAlert.type}
                onChange={(e) => setNewAlert({ ...newAlert, type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="ambulance">Ambulance</option>
                <option value="fire">Fire Department</option>
                <option value="police">Police</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vehicle ID
              </label>
              <input
                type="text"
                value={newAlert.vehicleId}
                onChange={(e) => setNewAlert({ ...newAlert, vehicleId: e.target.value })}
                placeholder="e.g., AMB-001"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority Level
              </label>
              <select
                value={newAlert.priority}
                onChange={(e) => setNewAlert({ ...newAlert, priority: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={!newAlert.vehicleId}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Activate Emergency Alert
          </button>
        </form>
      </div>

      {/* Active Alerts */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Emergency Alerts</h3>
        {activeAlerts.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-gray-500">No active emergency alerts</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeAlerts.map((alert) => (
              <div key={alert._id} className={`border-2 rounded-lg p-4 ${getPriorityColor(alert.priority)}`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{getAlertIcon(alert.type)}</span>
                    <div>
                      <h4 className="font-semibold capitalize">{alert.type} Alert</h4>
                      <p className="text-sm opacity-75">Vehicle ID: {alert.vehicleId}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-white/50">
                      {alert.priority} priority
                    </span>
                    <button
                      onClick={() => handleDeactivateAlert(alert._id)}
                      className="bg-white/20 hover:bg-white/30 text-current px-3 py-1 rounded-lg text-sm transition-colors"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="opacity-75">Current Location</p>
                    <p className="font-medium">
                      {alert.currentLocation.lat.toFixed(4)}, {alert.currentLocation.lng.toFixed(4)}
                    </p>
                  </div>
                  <div>
                    <p className="opacity-75">Destination</p>
                    <p className="font-medium">
                      {alert.destination.lat.toFixed(4)}, {alert.destination.lng.toFixed(4)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-white/20 rounded-lg">
                  <p className="text-sm font-medium">🚨 Green Corridor Active</p>
                  <p className="text-xs opacity-75 mt-1">
                    All vehicles on this route have been notified to give way
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emergency Guidelines */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">Emergency Response Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-blue-800 mb-2">For Drivers:</h4>
            <ul className="space-y-1 text-blue-700">
              <li>• Move to the rightmost lane when alerted</li>
              <li>• Maintain safe following distance</li>
              <li>• Do not block intersections</li>
              <li>• Follow traffic signals unless directed otherwise</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-blue-800 mb-2">For Emergency Vehicles:</h4>
            <ul className="space-y-1 text-blue-700">
              <li>• Activate alert before entering traffic</li>
              <li>• Update location continuously</li>
              <li>• Deactivate alert upon arrival</li>
              <li>• Use appropriate priority level</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
