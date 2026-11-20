export interface GeoPoint {
  lat: number;
  lng: number;
  address: string;
  label?: string;
}

export interface JourneyStop extends GeoPoint {
  id: string;
  sourcePoiId?: string;
  category?: "parking" | "fuel" | "charging" | "rest" | "food" | "service" | "custom" | "emergency";
  source?: "osm" | "user" | "saved";
}

export interface RoutePreferences {
  routeType: "fastest" | "shortest" | "balanced";
  avoidTolls: boolean;
  avoidHighways: boolean;
  optimizeStopOrder?: boolean;
}

export interface TurnComplexityAnalysis {
  totalSteps: number;
  maneuverCount: number;
  sharpTurns: number;
  roundabouts: number;
  mergesAndRamps: number;
  complexityScore: number; // 0 (simple) - 100 (very complex)
  complexityLabel: "Low" | "Moderate" | "High";
  roadSummary: string[];
}

export interface RouteStepInstruction {
  index: number;
  instruction: string;
  roadName: string;
  maneuverType: string;
  modifier?: string;
  distanceMeters: number;
  durationSeconds: number;
  lat: number;
  lng: number;
  exit?: number;
}

export interface RouteAlternative {
  routeId: string;
  label: string;
  distanceKm: number;
  durationMin: number;
  estimatedAvgSpeedKmh: number;
  geometry: Array<[number, number]>; // [lat, lng] pairs for Leaflet & 3D
  steps: RouteStepInstruction[];
  turns: TurnComplexityAnalysis;
  qualityScore: number; // 0-100 explainable composite score
  scoreBreakdown: {
    timeEfficiency: number;
    distanceEfficiency: number;
    turnSimplicity: number;
  };
  tags: string[];
  explanation: string;
  isRecommended: boolean;
  isFastest: boolean;
  isShortest: boolean;
  isLowestComplexity: boolean;
  timingDisclaimer: string;
}

export interface PredictiveRouteResult {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints: JourneyStop[];
  alternatives: RouteAlternative[];
  recommendedRouteId: string;
  predictionConfidence: "High" | "Moderate" | "Limited";
  confidenceReason: string;
  provider: string;
  calculatedAt: number;
  isEmergency?: boolean;
}

export interface DiscoveredPOI {
  id: string;
  name: string;
  category: "parking" | "fuel" | "charging" | "rest" | "food" | "service" | "hospital" | "police" | "fire";
  lat: number;
  lng: number;
  address: string;
  hasAddress?: boolean;
  distanceKm: number;
  accessibility?: string;
  openingHours?: string;
  capacity?: number | null;
  availabilityStatus: string; // Never fabricated: e.g. "Unknown (no live sensor feed)"
  source: "OpenStreetMap Overpass" | "OpenStreetMap Nominatim";
  phone?: string;
  website?: string;
  brand?: string;
  operator?: string;
  referenceLabel?: string;
}

export interface CommunityReport {
  _id: string;
  type: "hazard" | "accident" | "closure" | "construction" | "obstruction" | "parking_update" | "advisory";
  lat: number;
  lng: number;
  address: string;
  description: string;
  severity: "low" | "moderate" | "high";
  dataSource: "community";
  verificationStatus: "unverified" | "confirmed" | "flagged" | "resolved";
  confirmations: number;
  confirmedBy: string[];
  flaggedBy: string[];
  createdBy: string;
  createdAt: number;
  expiresAt: number;
}

export interface WeatherSnapshot {
  available: boolean;
  provider: string;
  timestamp: number;
  location: { lat: number; lng: number };
  temperatureC?: number;
  apparentTemperatureC?: number;
  precipitationMm?: number;
  rainMm?: number;
  windSpeedKmh?: number;
  weatherCode?: number;
  conditionLabel?: string;
  severeWarning?: string | null;
  airQuality?: {
    usAqi?: number;
    europeanAqi?: number;
    pm25?: number;
    category?: string;
  } | null;
  coverageNote: string;
  error?: string;
}

export interface LiveTrafficIncident {
  id: string;
  category: string;
  description: string;
  severity: "low" | "moderate" | "high";
  lat: number;
  lng: number;
  delayMinutes?: number;
}

export interface LiveTrafficSnapshot {
  available: boolean;
  provider: string;
  fetchedAt: number;
  location: { lat: number; lng: number };
  flow?: {
    currentSpeedKmh: number;
    freeFlowSpeedKmh: number;
    congestionLevel: "free" | "moderate" | "heavy" | "severe";
    confidence: number;
  } | null;
  incidents: LiveTrafficIncident[];
  reason?: string;
}

export interface UrbanBuilding {
  id: string;
  name?: string;
  address?: string;
  footprint: Array<[number, number]>; // [lat, lng]
  centerLat: number;
  centerLng: number;
  heightMeters: number;
  heightSource?: "osm_height" | "osm_levels" | "footprint_default";
  kind?: string;
}

export interface UrbanRoad {
  id: string;
  name?: string;
  points: Array<[number, number]>; // [lat, lng]
  highway: string;
  isBridge?: boolean;
  layer?: number;
  lanes?: number;
}

export interface UrbanPolygonFeature {
  id: string;
  name?: string;
  kind: string;
  footprint: Array<[number, number]>;
  centerLat: number;
  centerLng: number;
}

export interface UrbanPointFeature {
  id: string;
  name?: string;
  category: string;
  lat: number;
  lng: number;
  address?: string;
}

export interface UrbanTerrainGrid {
  available: boolean;
  source: string;
  baseElevationM: number;
  minElevationM: number;
  maxElevationM: number;
  gridSize: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  elevations: number[]; // row-major gridSize x gridSize
}

export interface UrbanContextData {
  source: string;
  fetchedAt: number;
  centerLat: number;
  centerLng: number;
  buildings: UrbanBuilding[];
  roads: UrbanRoad[];
  parks: UrbanPolygonFeature[];
  waterBodies: UrbanPolygonFeature[];
  trees: UrbanPointFeature[];
  landmarks: UrbanPointFeature[];
  terrain?: UrbanTerrainGrid | null;
  isFallbackGrid?: boolean;
}

export type VoiceLanguage = "en" | "hi" | "te";

export interface LivePositionSnapshot {
  lat: number;
  lng: number;
  heading: number | null; // degrees clockwise from North (0-360)
  speedKmh: number | null;
  accuracyM: number | null;
  timestamp: number;
  source: "gps" | "preview_simulation";
}

export interface LiveNavigationSnapshot {
  status: "idle" | "gps_active" | "preview_demo" | "arrived";
  isNavigating: boolean;
  currentPosition: LivePositionSnapshot | null;
  progressFraction: number; // 0..1
  remainingDistanceKm: number;
  remainingDurationMin: number;
  etaTimestamp: number | null;
  currentStepIndex: number;
  distanceToNextStepM: number | null;
  nextStep: RouteStepInstruction | null;
  followingStep: RouteStepInstruction | null;
  isOffRoute: boolean;
  offRouteDistanceM: number;
  isRecalculating: boolean;
  gpsError: string | null;
  voiceEnabled: boolean;
  voiceLanguage: VoiceLanguage;
  lastAnnouncement: string | null;
}

export interface SavedJourneyRecord {
  _id: string;
  _creationTime: number;
  userId: string;
  name: string;
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints: JourneyStop[];
  selectedRouteId: string;
  distanceKm: number;
  durationMin: number;
  turnCount: number;
  qualityScore: number;
  routeType: string;
  geometry: Array<[number, number]>;
  aiSummary?: string;
  isEmergency?: boolean;
}

export interface FavouriteDestination {
  _id: string;
  userId: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  category: "home" | "work" | "frequent" | "parking" | "emergency" | "other";
  createdAt: number;
}

export interface UserPreferencesRecord {
  preferredRouteType: "fastest" | "shortest" | "balanced";
  avoidTolls: boolean;
  avoidHighways: boolean;
  vehicleType: "car" | "ev" | "bike" | "truck";
  notificationsEnabled: boolean;
  parkingPreference: "closest" | "covered" | "ev_charging" | "accessible";
  accessibilityNeeds: boolean;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export interface AgentToolTrace {
  agent:
    | "Journey Planning Agent"
    | "Route Intelligence Agent"
    | "Driver Safety Agent"
    | "Parking & Stop Discovery Agent"
    | "Emergency Assistance Agent"
    | "Journey Summary Agent"
    | "Live Navigation Agent";
  toolName: string;
  status: "success" | "error";
  summary: string;
}

export interface CompanionMapAction {
  type: "apply_route" | "add_stop" | "highlight_pois" | "apply_emergency_route";
  label: string;
  routeResult?: PredictiveRouteResult;
  poi?: DiscoveredPOI;
  pois?: DiscoveredPOI[];
}

export interface CompanionResponse {
  reply: string;
  agentsUsed: string[];
  toolTraces: AgentToolTrace[];
  mapActions: CompanionMapAction[];
  modelUsed?: string;
  error?: string;
}
