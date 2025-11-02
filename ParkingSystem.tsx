import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export function ParkingSystem() {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [duration, setDuration] = useState(2);

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

    try {
      const startTime = Date.now();
      const endTime = startTime + (duration * 60 * 60 * 1000);

      const bookingId = await bookParkingSlot({
        parkingSlotId: slotId as any,
        startTime,
        endTime,
        vehicleNumber,
      });

      // Simulate payment processing
      setTimeout(async () => {
        await updatePaymentStatus({
          bookingId,
          paymentStatus: "paid",
        });
        toast.success("Parking booked and payment confirmed!");
      }, 2000);

      toast.success("Booking created! Processing payment...");
      setVehicleNumber("");
      setSelectedSlot(null);
    } catch (error) {
      toast.error("Failed to book parking slot");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Smart Parking System</h2>
        <p className="text-gray-600">Find and book available parking slots with real-time availability</p>
      </div>

      {/* Booking Form */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Book a Parking Slot</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vehicle Number
            </label>
            <input
              type="text"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              placeholder="e.g., ABC-1234"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duration (hours)
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
              <option value={4}>4 hours</option>
              <option value={8}>8 hours</option>
              <option value={24}>24 hours</option>
            </select>
          </div>
        </div>
      </div>

      {/* Available Parking Slots */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Parking Slots</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {parkingSlots.map((slot) => (
            <div key={slot._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900">{slot.name}</h4>
                  <p className="text-sm text-gray-600">{slot.location.address}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-600">${slot.pricePerHour}/hr</p>
                  <p className="text-sm text-gray-500">
                    {slot.availableSlots}/{slot.totalSlots} available
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 mb-3">
                {slot.amenities.map((amenity) => (
                  <span key={amenity} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    {amenity}
                  </span>
                ))}
              </div>

              <div className="flex justify-between items-center">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  slot.availableSlots > 10 
                    ? "bg-green-100 text-green-800" 
                    : slot.availableSlots > 0 
                    ? "bg-yellow-100 text-yellow-800" 
                    : "bg-red-100 text-red-800"
                }`}>
                  {slot.availableSlots > 0 ? "Available" : "Full"}
                </div>
                
                <button
                  onClick={() => handleBookSlot(slot._id)}
                  disabled={slot.availableSlots === 0 || !vehicleNumber}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Book Now (${(slot.pricePerHour * duration).toFixed(2)})
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Bookings */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Bookings</h3>
        {userBookings.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No bookings yet</p>
        ) : (
          <div className="space-y-4">
            {userBookings.map((booking) => (
              <div key={booking._id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-semibold">{booking.parkingSlot?.name}</h4>
                    <p className="text-sm text-gray-600">{booking.parkingSlot?.location.address}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      booking.paymentStatus === "paid" 
                        ? "bg-green-100 text-green-800" 
                        : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {booking.paymentStatus}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Vehicle</p>
                    <p className="font-medium">{booking.vehicleNumber}</p>
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
                    <p className="text-gray-500">Amount</p>
                    <p className="font-medium">${booking.totalAmount.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
