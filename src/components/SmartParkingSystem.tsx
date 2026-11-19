import { useState } from "react";
import { useMutation, useQuery } from "../lib/convexAdapter";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export function SmartParkingSystem() {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [duration, setDuration] = useState(2);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isBooking, setIsBooking] = useState(false);

  const parkingSlots = useQuery(api.parking.getParkingSlots, {
    lat: 40.7128,
    lng: -74.0060,
  }) || [];
  
  const userBookings = useQuery(api.parking.getUserBookings) || [];
  const bookParkingSlot = useMutation(api.parking.bookParkingSlot);
  const updatePaymentStatus = useMutation(api.parking.updatePaymentStatus);

  const handleBookSlot = async (slotId: string) => {
    if (!vehicleNumber) {
      toast.error("Please enter vehicle number");
      return;
    }

    setIsBooking(true);
    try {
      const startTime = Date.now();
      const endTime = startTime + (duration * 60 * 60 * 1000);

      const bookingId = await bookParkingSlot({
        parkingSlotId: slotId as any,
        startTime,
        endTime,
        vehicleNumber,
      });

      // Simulate payment processing with enhanced UX
      toast.success("🎫 Booking created! Processing payment...");
      
      setTimeout(async () => {
        await updatePaymentStatus({
          bookingId,
          paymentStatus: "paid",
        });
        toast.success("✅ Payment confirmed! Booking complete!");
        
        // Show booking confirmation
        setTimeout(() => {
          toast.success(`🅿️ Spot reserved! Check-in code: ${Math.random().toString(36).substr(2, 6).toUpperCase()}`);
        }, 1000);
      }, 2000);

      setVehicleNumber("");
      setSelectedSlot(null);
    } catch (error) {
      toast.error("Failed to book parking slot");
    } finally {
      setIsBooking(false);
    }
  };

  const getAvailabilityColor = (available: number, total: number) => {
    const percentage = (available / total) * 100;
    if (percentage > 50) return "text-green-600 bg-green-100";
    if (percentage > 20) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  const getAmenityIcon = (amenity: string) => {
    const icons: Record<string, string> = {
      "CCTV": "📹",
      "Security": "🛡️",
      "EV Charging": "⚡",
      "Valet Service": "🚗",
      "Car Wash": "🧽",
      "Covered": "🏠",
      "24/7": "🕐",
    };
    return icons[amenity] || "✨";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Smart Parking System</h2>
        <p className="text-gray-600">AI-powered parking with real-time availability and instant booking</p>
      </div>

      {/* Enhanced Booking Form */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
        <h3 className="text-lg font-semibold mb-4 text-green-900">🅿️ Reserve Your Spot</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vehicle Number
            </label>
            <input
              type="text"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
              placeholder="e.g., ABC-1234"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value={0.5}>30 minutes</option>
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
              <option value={4}>4 hours</option>
              <option value={8}>8 hours</option>
              <option value={24}>24 hours</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="card">💳 Credit Card</option>
              <option value="wallet">📱 Digital Wallet</option>
              <option value="upi">💰 UPI</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="w-full bg-white/50 rounded-lg p-3 text-center">
              <p className="text-sm text-gray-600">Estimated Cost</p>
              <p className="text-lg font-bold text-green-600">
                ${selectedSlot ? ((parkingSlots.find(s => s._id === selectedSlot)?.pricePerHour || 0) * duration).toFixed(2) : "0.00"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Available Parking Slots */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Available Parking Locations</h3>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span>Limited</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span>Full</span>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {parkingSlots.map((slot) => {
            const availabilityPercentage = (slot.availableSlots / slot.totalSlots) * 100;
            const isSelected = selectedSlot === slot._id;
            
            return (
              <div 
                key={slot._id} 
                className={`border-2 rounded-lg p-6 transition-all cursor-pointer hover:shadow-lg ${
                  isSelected 
                    ? "border-green-500 bg-green-50 shadow-lg" 
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => setSelectedSlot(slot._id)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 text-lg">{slot.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">📍 {slot.location.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-600">${slot.pricePerHour}/hr</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <div className={`w-3 h-3 rounded-full ${
                        availabilityPercentage > 50 ? "bg-green-500" :
                        availabilityPercentage > 20 ? "bg-yellow-500" : "bg-red-500"
                      }`}></div>
                      <p className="text-sm text-gray-500">
                        {slot.availableSlots}/{slot.totalSlots} spots
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Availability Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Availability</span>
                    <span>{Math.round(availabilityPercentage)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        availabilityPercentage > 50 ? "bg-green-500" :
                        availabilityPercentage > 20 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                      style={{ width: `${availabilityPercentage}%` }}
                    ></div>
                  </div>
                </div>
                
                {/* Amenities */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {slot.amenities.map((amenity) => (
                    <span key={amenity} className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full flex items-center space-x-1">
                      <span>{getAmenityIcon(amenity)}</span>
                      <span>{amenity}</span>
                    </span>
                  ))}
                </div>

                {/* Booking Button */}
                <div className="flex justify-between items-center">
                  <span className={`px-3 py-2 rounded-full text-sm font-medium ${getAvailabilityColor(slot.availableSlots, slot.totalSlots)}`}>
                    {slot.availableSlots > 0 ? `${slot.availableSlots} Available` : "Full"}
                  </span>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBookSlot(slot._id);
                    }}
                    disabled={slot.availableSlots === 0 || !vehicleNumber || isBooking}
                    className={`px-6 py-2 rounded-lg font-medium transition-all transform hover:scale-105 active:scale-95 ${
                      isSelected && vehicleNumber
                        ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {isBooking ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Booking...</span>
                      </div>
                    ) : (
                      `Book ${duration}h - $${(slot.pricePerHour * duration).toFixed(2)}`
                    )}
                  </button>
                </div>

                {isSelected && (
                  <div className="mt-4 p-3 bg-green-100 rounded-lg">
                    <p className="text-sm font-medium text-green-900">🎯 Selected Location</p>
                    <p className="text-xs text-green-700 mt-1">
                      Real-time availability • Instant confirmation • Mobile check-in
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Enhanced User Bookings */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Parking History</h3>
        {userBookings.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <div className="text-4xl mb-4">🅿️</div>
            <p className="text-gray-500 text-lg">No bookings yet</p>
            <p className="text-gray-400 text-sm">Book your first parking spot above</p>
          </div>
        ) : (
          <div className="space-y-4">
            {userBookings.map((booking) => (
              <div key={booking._id} className="border border-gray-200 rounded-lg p-6 bg-white hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-semibold text-lg">{booking.parkingSlot?.name}</h4>
                    <p className="text-sm text-gray-600">📍 {booking.parkingSlot?.location.address}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      booking.paymentStatus === "paid" 
                        ? "bg-green-100 text-green-800" 
                        : booking.paymentStatus === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}>
                      {booking.paymentStatus === "paid" ? "✅ Paid" : 
                       booking.paymentStatus === "pending" ? "⏳ Pending" : "❌ Failed"}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Vehicle</p>
                    <p className="font-medium">🚗 {booking.vehicleNumber}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Start Time</p>
                    <p className="font-medium">{new Date(booking.startTime).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">End Time</p>
                    <p className="font-medium">{new Date(booking.endTime).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Duration</p>
                    <p className="font-medium">{Math.round((booking.endTime - booking.startTime) / (1000 * 60 * 60))}h</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Amount</p>
                    <p className="font-medium text-green-600">${booking.totalAmount.toFixed(2)}</p>
                  </div>
                </div>

                {booking.paymentStatus === "paid" && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">🎫 Booking Confirmed</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Check-in code: {Math.random().toString(36).substr(2, 6).toUpperCase()} • Show this at the entrance
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
