import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LiveNavigationSnapshot,
  LivePositionSnapshot,
  PredictiveRouteResult,
  RouteAlternative,
  RouteStepInstruction,
  VoiceLanguage,
} from "../types/mobility";
import {
  formatNavigationEvent,
  formatTurnAnnouncement,
  speakNavigationText,
  stopSpeech,
} from "../services/voiceNavigationService";

const EARTH_RADIUS_M = 6371000;
const OFF_ROUTE_THRESHOLD_M = 85;
const REROUTE_COOLDOWN_MS = 15000;
const ARRIVAL_THRESHOLD_M = 45;
const URBAN_CHUNK_MOVE_THRESHOLD_M = 450;

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeBearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

interface CumulativeGeometry {
  coords: Array<[number, number]>;
  cumDistM: number[];
  totalDistM: number;
}

function buildCumulativeGeometry(coords: Array<[number, number]>): CumulativeGeometry {
  if (coords.length === 0) {
    return { coords: [], cumDistM: [], totalDistM: 0 };
  }
  const cumDistM: number[] = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(
      coords[i - 1][0],
      coords[i - 1][1],
      coords[i][0],
      coords[i][1],
    );
    cumDistM.push(total);
  }
  return { coords, cumDistM, totalDistM: total };
}

function projectOntoRoute(
  lat: number,
  lng: number,
  geom: CumulativeGeometry,
): {
  snappedLat: number;
  snappedLng: number;
  traveledM: number;
  remainingM: number;
  offRouteM: number;
  headingDeg: number;
} {
  const { coords, cumDistM, totalDistM } = geom;
  if (coords.length < 2) {
    return {
      snappedLat: lat,
      snappedLng: lng,
      traveledM: 0,
      remainingM: totalDistM,
      offRouteM: 0,
      headingDeg: 0,
    };
  }

  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const toLocalX = (lon: number) => (lon - lng) * 111320 * cosLat;
  const toLocalY = (la: number) => (la - lat) * 111320;

  let bestDistSq = Infinity;
  let bestLat = coords[0][0];
  let bestLng = coords[0][1];
  let bestTraveled = 0;
  let bestSegIdx = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const [aLat, aLng] = coords[i];
    const [bLat, bLng] = coords[i + 1];
    const ax = toLocalX(aLng);
    const ay = toLocalY(aLat);
    const bx = toLocalX(bLng);
    const by = toLocalY(bLat);
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0.001) {
      t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
    }
    const px = ax + dx * t;
    const py = ay + dy * t;
    const distSq = px * px + py * py;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestLat = aLat + (bLat - aLat) * t;
      bestLng = aLng + (bLng - aLng) * t;
      const segLen = cumDistM[i + 1] - cumDistM[i];
      bestTraveled = cumDistM[i] + segLen * t;
      bestSegIdx = i;
    }
  }

  const headingDeg = computeBearingDeg(
    coords[bestSegIdx][0],
    coords[bestSegIdx][1],
    coords[bestSegIdx + 1][0],
    coords[bestSegIdx + 1][1],
  );

  return {
    snappedLat: bestLat,
    snappedLng: bestLng,
    traveledM: bestTraveled,
    remainingM: Math.max(0, totalDistM - bestTraveled),
    offRouteM: Math.round(Math.sqrt(bestDistSq)),
    headingDeg,
  };
}

function interpolateAlongRoute(
  distanceM: number,
  geom: CumulativeGeometry,
): { lat: number; lng: number; headingDeg: number } {
  const { coords, cumDistM, totalDistM } = geom;
  if (coords.length === 0) return { lat: 0, lng: 0, headingDeg: 0 };
  if (coords.length === 1 || distanceM <= 0) {
    const h =
      coords.length > 1
        ? computeBearingDeg(coords[0][0], coords[0][1], coords[1][0], coords[1][1])
        : 0;
    return { lat: coords[0][0], lng: coords[0][1], headingDeg: h };
  }
  if (distanceM >= totalDistM) {
    const n = coords.length;
    return {
      lat: coords[n - 1][0],
      lng: coords[n - 1][1],
      headingDeg: computeBearingDeg(
        coords[n - 2][0],
        coords[n - 2][1],
        coords[n - 1][0],
        coords[n - 1][1],
      ),
    };
  }

  for (let i = 0; i < coords.length - 1; i++) {
    if (distanceM >= cumDistM[i] && distanceM <= cumDistM[i + 1]) {
      const segLen = Math.max(0.01, cumDistM[i + 1] - cumDistM[i]);
      const t = (distanceM - cumDistM[i]) / segLen;
      const lat = coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t;
      const lng = coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t;
      const headingDeg = computeBearingDeg(
        coords[i][0],
        coords[i][1],
        coords[i + 1][0],
        coords[i + 1][1],
      );
      return { lat, lng, headingDeg };
    }
  }
  return {
    lat: coords[coords.length - 1][0],
    lng: coords[coords.length - 1][1],
    headingDeg: 0,
  };
}

function mapStepDistances(
  steps: RouteStepInstruction[],
  geom: CumulativeGeometry,
): number[] {
  if (steps.length === 0 || geom.totalDistM <= 0) return [];
  let running = 0;
  return steps.map((s, idx) => {
    if (idx === 0) return 0;
    if (idx === steps.length - 1 || s.maneuverType === "arrive") {
      return geom.totalDistM;
    }
    // Project step maneuver location onto route, keeping monotonic progression
    const proj = projectOntoRoute(s.lat, s.lng, geom);
    running = Math.max(running, proj.traveledM);
    return Math.min(geom.totalDistM, running);
  });
}

export interface UseLiveNavigationOptions {
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  onRecalculateFromPosition?: (lat: number, lng: number) => Promise<void>;
  onRequestUrbanChunk?: (lat: number, lng: number) => void;
}

export interface LiveNavigationController {
  snapshot: LiveNavigationSnapshot;
  previewPaused: boolean;
  previewSpeedMultiplier: number;
  startGpsNavigation: () => void;
  startPreviewSimulation: () => void;
  stopNavigation: () => void;
  togglePreviewPause: () => void;
  cyclePreviewSpeed: () => void;
  setVoiceEnabled: (enabled: boolean) => void;
  toggleVoice: () => void;
  setVoiceLanguage: (lang: VoiceLanguage) => void;
  repeatNextInstruction: () => void;
}

export function useLiveNavigation({
  routeResult,
  selectedRouteId,
  onRecalculateFromPosition,
  onRequestUrbanChunk,
}: UseLiveNavigationOptions): LiveNavigationController {
  const activeRoute: RouteAlternative | null = useMemo(() => {
    if (!routeResult) return null;
    return (
      routeResult.alternatives.find((a) => a.routeId === selectedRouteId) ||
      routeResult.alternatives.find((a) => a.isRecommended) ||
      routeResult.alternatives[0] ||
      null
    );
  }, [routeResult, selectedRouteId]);

  const geom = useMemo(
    () => buildCumulativeGeometry(activeRoute?.geometry || []),
    [activeRoute],
  );

  const steps = useMemo(() => activeRoute?.steps || [], [activeRoute]);
  const stepDistancesM = useMemo(() => mapStepDistances(steps, geom), [steps, geom]);

  const [status, setStatus] = useState<LiveNavigationSnapshot["status"]>("idle");
  const [currentPosition, setCurrentPosition] = useState<LivePositionSnapshot | null>(null);
  const [progressFraction, setProgressFraction] = useState(0);
  const [remainingDistanceKm, setRemainingDistanceKm] = useState(0);
  const [remainingDurationMin, setRemainingDurationMin] = useState(0);
  const [etaTimestamp, setEtaTimestamp] = useState<number | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToNextStepM, setDistanceToNextStepM] = useState<number | null>(null);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [offRouteDistanceM, setOffRouteDistanceM] = useState(0);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabledState] = useState(true);
  const [voiceLanguage, setVoiceLanguageState] = useState<VoiceLanguage>("en");
  const [lastAnnouncement, setLastAnnouncement] = useState<string | null>(null);
  const [previewPaused, setPreviewPaused] = useState(false);
  const [previewSpeedMultiplier, setPreviewSpeedMultiplier] = useState(1);

  // Mutable refs for continuous GPS/preview loops without stale closures
  const watchIdRef = useRef<number | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const previewDistMRef = useRef(0);
  const previewPausedRef = useRef(false);
  const previewSpeedRef = useRef(1);
  const voiceEnabledRef = useRef(true);
  const voiceLangRef = useRef<VoiceLanguage>("en");
  const announcedStepStageRef = useRef<Map<number, number>>(new Map());
  const lastRerouteAtRef = useRef(0);
  const lastChunkPointRef = useRef<{ lat: number; lng: number } | null>(null);
  const activeRouteKeyRef = useRef<string | null>(null);
  const isRecalculatingRef = useRef(false);

  useEffect(() => {
    previewPausedRef.current = previewPaused;
  }, [previewPaused]);

  useEffect(() => {
    previewSpeedRef.current = previewSpeedMultiplier;
  }, [previewSpeedMultiplier]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    voiceLangRef.current = voiceLanguage;
  }, [voiceLanguage]);

  const clearTimers = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (previewTimerRef.current !== null) {
      window.clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }, []);

  const announce = useCallback((text: string, urgent = false) => {
    setLastAnnouncement(text);
    speakNavigationText(text, voiceLangRef.current, voiceEnabledRef.current, urgent);
  }, []);

  const maybeRequestUrbanChunk = useCallback(
    (lat: number, lng: number) => {
      if (!onRequestUrbanChunk) return;
      const last = lastChunkPointRef.current;
      if (!last || haversineMeters(last.lat, last.lng, lat, lng) >= URBAN_CHUNK_MOVE_THRESHOLD_M) {
        lastChunkPointRef.current = { lat, lng };
        onRequestUrbanChunk(lat, lng);
      }
    },
    [onRequestUrbanChunk],
  );

  // Sync baseline metrics when route changes; reset navigation cleanly if destination changed
  useEffect(() => {
    if (!routeResult || !activeRoute) {
      clearTimers();
      stopSpeech();
      setStatus("idle");
      setCurrentPosition(null);
      setProgressFraction(0);
      setRemainingDistanceKm(0);
      setRemainingDurationMin(0);
      setEtaTimestamp(null);
      setCurrentStepIndex(0);
      setDistanceToNextStepM(null);
      setIsOffRoute(false);
      setOffRouteDistanceM(0);
      activeRouteKeyRef.current = null;
      return;
    }

    const destKey = `${routeResult.destination.lat.toFixed(4)},${routeResult.destination.lng.toFixed(4)}`;
    const prevKey = activeRouteKeyRef.current;
    activeRouteKeyRef.current = destKey;

    announcedStepStageRef.current.clear();
    setRemainingDistanceKm(activeRoute.distanceKm);
    setRemainingDurationMin(activeRoute.durationMin);
    setEtaTimestamp(Date.now() + activeRoute.durationMin * 60_000);
    setCurrentStepIndex(steps.length > 1 ? 1 : 0);
    setDistanceToNextStepM(steps[0]?.distanceMeters ?? null);

    // If destination changed while preview was active, stop preview cleanly so user doesn't see stale motion
    if (prevKey && prevKey !== destKey && status === "preview_demo") {
      clearTimers();
      stopSpeech();
      setStatus("idle");
      setCurrentPosition(null);
      setProgressFraction(0);
    }

    // If we just finished recalculating from GPS off-route, announce updated route
    if (isRecalculatingRef.current && status === "gps_active") {
      isRecalculatingRef.current = false;
      setIsRecalculating(false);
      setIsOffRoute(false);
      setOffRouteDistanceM(0);
      announce(
        formatNavigationEvent(
          "rerouted",
          {
            destinationName: routeResult.destination.label || routeResult.destination.address.split(",")[0],
            remainingKm: activeRoute.distanceKm,
            remainingMin: activeRoute.durationMin,
          },
          voiceLangRef.current,
        ),
        true,
      );
    }
  }, [routeResult, activeRoute, steps, status, clearTimers, announce]);

  // Core progress evaluator shared by GPS & Preview modes
  const evaluatePosition = useCallback(
    (
      pos: LivePositionSnapshot,
      mode: "gps_active" | "preview_demo",
    ) => {
      if (!routeResult || !activeRoute || geom.totalDistM <= 0) return;

      const proj = projectOntoRoute(pos.lat, pos.lng, geom);
      const effectiveHeading =
        pos.heading != null && Number.isFinite(pos.heading)
          ? pos.heading
          : proj.headingDeg;

      const updatedPos: LivePositionSnapshot = {
        ...pos,
        heading: effectiveHeading,
      };
      setCurrentPosition(updatedPos);

      const totalM = Math.max(geom.totalDistM, 1);
      const frac = Math.max(0, Math.min(1, proj.traveledM / totalM));
      const remKm = Number((proj.remainingM / 1000).toFixed(2));
      const avgSpeedKmh = Math.max(
        10,
        pos.speedKmh && pos.speedKmh > 6
          ? pos.speedKmh * 0.4 + activeRoute.estimatedAvgSpeedKmh * 0.6
          : activeRoute.estimatedAvgSpeedKmh,
      );
      const remMin = Math.max(0, (remKm / avgSpeedKmh) * 60);

      setProgressFraction(frac);
      setRemainingDistanceKm(remKm);
      setRemainingDurationMin(Math.round(remMin));
      setEtaTimestamp(Date.now() + remMin * 60_000);
      setOffRouteDistanceM(proj.offRouteM);

      // Progressive urban context loading as driver moves
      maybeRequestUrbanChunk(pos.lat, pos.lng);

      // Arrival detection
      const distToDestM = haversineMeters(
        pos.lat,
        pos.lng,
        routeResult.destination.lat,
        routeResult.destination.lng,
      );
      if (distToDestM <= ARRIVAL_THRESHOLD_M || frac >= 0.995) {
        clearTimers();
        setStatus("arrived");
        setProgressFraction(1);
        setRemainingDistanceKm(0);
        setRemainingDurationMin(0);
        setIsOffRoute(false);
        const destName =
          routeResult.destination.label ||
          routeResult.destination.address.split(",")[0];
        announce(
          formatNavigationEvent("arrived", { destinationName: destName }, voiceLangRef.current),
          true,
        );
        return;
      }

      // Off-route detection (only in real GPS mode)
      if (mode === "gps_active" && proj.offRouteM > OFF_ROUTE_THRESHOLD_M) {
        setIsOffRoute(true);
        const now = Date.now();
        if (
          onRecalculateFromPosition &&
          !isRecalculatingRef.current &&
          now - lastRerouteAtRef.current > REROUTE_COOLDOWN_MS
        ) {
          lastRerouteAtRef.current = now;
          isRecalculatingRef.current = true;
          setIsRecalculating(true);
          announce(
            formatNavigationEvent("off_route", {}, voiceLangRef.current),
            true,
          );
          onRecalculateFromPosition(pos.lat, pos.lng).catch(() => {
            isRecalculatingRef.current = false;
            setIsRecalculating(false);
          });
        }
        return;
      } else {
        setIsOffRoute(false);
      }

      // Find next upcoming step along route
      if (steps.length > 0 && stepDistancesM.length === steps.length) {
        let nextIdx = steps.length - 1;
        for (let i = 1; i < stepDistancesM.length; i++) {
          if (stepDistancesM[i] > proj.traveledM + 18) {
            nextIdx = i;
            break;
          }
        }
        setCurrentStepIndex(nextIdx);
        const distToStep = Math.max(0, Math.round(stepDistancesM[nextIdx] - proj.traveledM));
        setDistanceToNextStepM(distToStep);

        // Two-stage Google Maps-like voice cues per step:
        // Stage 1: pre-announcement (~350m-500m ahead for significant turns)
        // Stage 2: imminent maneuver (~75m-110m ahead)
        const prevStage = announcedStepStageRef.current.get(nextIdx) || 0;
        const stepObj = steps[nextIdx];
        if (stepObj && stepObj.maneuverType !== "depart") {
          if (distToStep <= 95 && prevStage < 2) {
            announcedStepStageRef.current.set(nextIdx, 2);
            announce(
              formatTurnAnnouncement(stepObj, distToStep, voiceLangRef.current),
              true,
            );
          } else if (distToStep <= 420 && distToStep > 140 && prevStage < 1) {
            announcedStepStageRef.current.set(nextIdx, 1);
            announce(
              formatTurnAnnouncement(stepObj, distToStep, voiceLangRef.current),
              false,
            );
          }
        }
      }
    },
    [
      routeResult,
      activeRoute,
      geom,
      steps,
      stepDistancesM,
      maybeRequestUrbanChunk,
      clearTimers,
      announce,
      onRecalculateFromPosition,
    ],
  );

  const startGpsNavigation = useCallback(() => {
    if (!routeResult || !activeRoute) return;
    clearTimers();
    setGpsError(null);
    setIsOffRoute(false);
    announcedStepStageRef.current.clear();

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError(
        "Browser GPS geolocation is not supported on this device. Use Simulated Route Preview to test turn-by-turn guidance.",
      );
      return;
    }

    setStatus("gps_active");
    const destName =
      routeResult.destination.label ||
      routeResult.destination.address.split(",")[0];
    announce(
      formatNavigationEvent(
        "start",
        {
          destinationName: destName,
          remainingKm: activeRoute.distanceKm,
          remainingMin: activeRoute.durationMin,
          isPreview: false,
        },
        voiceLangRef.current,
      ),
      true,
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (geo) => {
        setGpsError(null);
        const speedMs = geo.coords.speed;
        const speedKmh =
          typeof speedMs === "number" && Number.isFinite(speedMs) && speedMs >= 0
            ? Math.round(speedMs * 3.6)
            : null;
        const heading =
          typeof geo.coords.heading === "number" &&
          Number.isFinite(geo.coords.heading) &&
          geo.coords.heading >= 0
            ? geo.coords.heading
            : null;

        evaluatePosition(
          {
            lat: geo.coords.latitude,
            lng: geo.coords.longitude,
            heading,
            speedKmh,
            accuracyM:
              typeof geo.coords.accuracy === "number"
                ? Math.round(geo.coords.accuracy)
                : null,
            timestamp: geo.timestamp || Date.now(),
            source: "gps",
          },
          "gps_active",
        );
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Allow GPS access in your browser or use Simulated Route Preview."
            : err.code === err.POSITION_UNAVAILABLE
              ? "GPS signal currently unavailable. Try moving outdoors or use Simulated Route Preview."
              : "GPS request timed out. Retrying location lock...";
        setGpsError(msg);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1500,
        timeout: 12000,
      },
    );
  }, [routeResult, activeRoute, clearTimers, announce, evaluatePosition]);

  const startPreviewSimulation = useCallback(() => {
    if (!routeResult || !activeRoute || geom.totalDistM <= 0) return;
    clearTimers();
    setGpsError(null);
    setIsOffRoute(false);
    setPreviewPaused(false);
    previewPausedRef.current = false;
    previewDistMRef.current = 0;
    announcedStepStageRef.current.clear();

    setStatus("preview_demo");
    const destName =
      routeResult.destination.label ||
      routeResult.destination.address.split(",")[0];
    announce(
      formatNavigationEvent(
        "start",
        {
          destinationName: destName,
          remainingKm: activeRoute.distanceKm,
          remainingMin: activeRoute.durationMin,
          isPreview: true,
        },
        voiceLangRef.current,
      ),
      true,
    );

    const startPt = interpolateAlongRoute(0, geom);
    evaluatePosition(
      {
        lat: startPt.lat,
        lng: startPt.lng,
        heading: startPt.headingDeg,
        speedKmh: activeRoute.estimatedAvgSpeedKmh,
        accuracyM: null,
        timestamp: Date.now(),
        source: "preview_simulation",
      },
      "preview_demo",
    );

    // Advance smoothly every 250ms along the real OSRM geometry
    const tickMs = 250;
    // Choose a comfortable preview pace scaled by route length so both 2km & 40km routes feel responsive
    const baseMetersPerSec = Math.max(
      14,
      Math.min(55, (activeRoute.estimatedAvgSpeedKmh * 1000) / 3600 * 1.4),
    );

    previewTimerRef.current = window.setInterval(() => {
      if (previewPausedRef.current) return;
      const stepDist =
        baseMetersPerSec * (tickMs / 1000) * previewSpeedRef.current;
      previewDistMRef.current = Math.min(
        geom.totalDistM,
        previewDistMRef.current + stepDist,
      );
      const pt = interpolateAlongRoute(previewDistMRef.current, geom);
      evaluatePosition(
        {
          lat: pt.lat,
          lng: pt.lng,
          heading: pt.headingDeg,
          speedKmh: Math.round(activeRoute.estimatedAvgSpeedKmh),
          accuracyM: null,
          timestamp: Date.now(),
          source: "preview_simulation",
        },
        "preview_demo",
      );
    }, tickMs);
  }, [routeResult, activeRoute, geom, clearTimers, announce, evaluatePosition]);

  const stopNavigation = useCallback(() => {
    clearTimers();
    stopSpeech();
    setStatus("idle");
    setCurrentPosition(null);
    setProgressFraction(0);
    setIsOffRoute(false);
    setOffRouteDistanceM(0);
    setIsRecalculating(false);
    isRecalculatingRef.current = false;
    setGpsError(null);
    if (activeRoute) {
      setRemainingDistanceKm(activeRoute.distanceKm);
      setRemainingDurationMin(activeRoute.durationMin);
      setEtaTimestamp(Date.now() + activeRoute.durationMin * 60_000);
    }
  }, [clearTimers, activeRoute]);

  const togglePreviewPause = useCallback(() => {
    setPreviewPaused((prev) => !prev);
  }, []);

  const cyclePreviewSpeed = useCallback(() => {
    setPreviewSpeedMultiplier((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : 1));
  }, []);

  const setVoiceEnabled = useCallback((enabled: boolean) => {
    setVoiceEnabledState(enabled);
    if (!enabled) stopSpeech();
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabledState((prev) => {
      const next = !prev;
      if (!next) stopSpeech();
      return next;
    });
  }, []);

  const setVoiceLanguage = useCallback((lang: VoiceLanguage) => {
    setVoiceLanguageState(lang);
  }, []);

  const repeatNextInstruction = useCallback(() => {
    const nextStep = steps[currentStepIndex] || steps[0];
    if (!nextStep) return;
    const dist = distanceToNextStepM ?? nextStep.distanceMeters;
    announce(formatTurnAnnouncement(nextStep, dist, voiceLangRef.current), true);
  }, [steps, currentStepIndex, distanceToNextStepM, announce]);

  // Clean up geolocation watchers & intervals on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      stopSpeech();
    };
  }, [clearTimers]);

  const nextStep = steps[currentStepIndex] || steps[0] || null;
  const followingStep =
    currentStepIndex + 1 < steps.length ? steps[currentStepIndex + 1] : null;

  const snapshot: LiveNavigationSnapshot = useMemo(
    () => ({
      status,
      isNavigating: status === "gps_active" || status === "preview_demo",
      currentPosition,
      progressFraction,
      remainingDistanceKm,
      remainingDurationMin,
      etaTimestamp,
      currentStepIndex,
      distanceToNextStepM,
      nextStep,
      followingStep,
      isOffRoute,
      offRouteDistanceM,
      isRecalculating,
      gpsError,
      voiceEnabled,
      voiceLanguage,
      lastAnnouncement,
    }),
    [
      status,
      currentPosition,
      progressFraction,
      remainingDistanceKm,
      remainingDurationMin,
      etaTimestamp,
      currentStepIndex,
      distanceToNextStepM,
      nextStep,
      followingStep,
      isOffRoute,
      offRouteDistanceM,
      isRecalculating,
      gpsError,
      voiceEnabled,
      voiceLanguage,
      lastAnnouncement,
    ],
  );

  return {
    snapshot,
    previewPaused,
    previewSpeedMultiplier,
    startGpsNavigation,
    startPreviewSimulation,
    stopNavigation,
    togglePreviewPause,
    cyclePreviewSpeed,
    setVoiceEnabled,
    toggleVoice,
    setVoiceLanguage,
    repeatNextInstruction,
  };
}
