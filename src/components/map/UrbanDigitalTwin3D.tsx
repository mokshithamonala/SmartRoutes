import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type {
  CommunityReport,
  DiscoveredPOI,
  PredictiveRouteResult,
  UrbanContextData,
} from "../../types/mobility";

interface UrbanDigitalTwin3DProps {
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  discoveredPOIs: DiscoveredPOI[];
  communityReports: CommunityReport[];
  urbanContext: UrbanContextData | null;
  nightMode: boolean;
  onToggleNightMode: () => void;
  onSelectRoute: (routeId: string) => void;
}

type CameraPreset = "overview" | "follow" | "topdown";

// Reusable math objects outside frame loop (zero per-frame GC)
const _vPos = new THREE.Vector3();
const _vAhead = new THREE.Vector3();
const _vCamTarget = new THREE.Vector3();
const _vLookTarget = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

// Project WGS84 lat/lng to local scene meters scaled cleanly for WebGL precision
function createProjector(centerLat: number, centerLng: number, scale = 0.04) {
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  return (lat: number, lng: number): [number, number] => {
    const x = (lng - centerLng) * 111320 * cosLat * scale;
    const z = -(lat - centerLat) * 110540 * scale;
    return [x, z];
  };
}

// Procedural building facade texture (day / night) — zero external texture 404s
function createFacadeTexture(nightMode: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = nightMode ? "#162032" : "#cbd5e1";
  ctx.fillRect(0, 0, 128, 128);

  const cols = 4;
  const rows = 6;
  const padX = 8;
  const padY = 6;
  const cellW = 128 / cols;
  const cellH = 128 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = (r * 7 + c * 13) % 5 !== 0;
      ctx.fillStyle = nightMode
        ? lit
          ? "#fbbf24"
          : "#0f172a"
        : lit
          ? "#94a3b8"
          : "#64748b";
      ctx.fillRect(
        c * cellW + padX * 0.5,
        r * cellH + padY * 0.5,
        cellW - padX,
        cellH - padY,
      );
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural asphalt road ground grid texture
function createGroundTexture(nightMode: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = nightMode ? "#0b1120" : "#e2e8f0";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = nightMode ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function StudioEnvironment({ nightMode }: { nightMode: boolean }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();
    return () => {
      envTex.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);

  useEffect(() => {
    const bg = new THREE.Color(nightMode ? "#090f1d" : "#dbeafe");
    scene.background = bg;
    scene.fog = new THREE.FogExp2(nightMode ? "#090f1d" : "#dbeafe", nightMode ? 0.0042 : 0.0032);
  }, [scene, nightMode]);

  return null;
}

// Composite 8-part procedural vehicle (never a single primitive!)
function CompositeVehicle({
  curve,
  speed,
  offset,
  isHero,
  isEmergency,
  paused,
  onHeroTransform,
}: {
  curve: THREE.CatmullRomCurve3;
  speed: number;
  offset: number;
  isHero?: boolean;
  isEmergency?: boolean;
  paused: boolean;
  onHeroTransform?: (pos: THREE.Vector3, ahead: THREE.Vector3) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const tRef = useRef(offset);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (!paused) {
      tRef.current = (tRef.current + delta * speed) % 1;
    }
    const t = tRef.current;
    const tNext = Math.min(0.999, t + 0.008);
    curve.getPointAt(t, _vPos);
    curve.getPointAt(tNext, _vAhead);
    groupRef.current.position.set(_vPos.x, 0.28, _vPos.z);
    groupRef.current.lookAt(_vAhead.x, 0.28, _vAhead.z);

    if (isHero && onHeroTransform) {
      onHeroTransform(_vPos, _vAhead);
    }
  });

  const bodyColor = isEmergency ? "#ef4444" : isHero ? "#2563eb" : "#475569";
  const scale = isHero ? 1.15 : 0.85;

  return (
    <group ref={groupRef} scale={scale}>
      {/* 1. Lower Chassis */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.92, 0.22, 2.05]} />
        <meshStandardMaterial color="#1e293b" roughness={0.75} metalness={0.2} />
      </mesh>
      {/* 2. Sculpted Main Body */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.96, 0.28, 1.95]} />
        <meshStandardMaterial color={bodyColor} roughness={0.25} metalness={0.7} />
      </mesh>
      {/* 3. Tinted Cabin Glass */}
      <mesh position={[0, 0.68, -0.08]} castShadow>
        <boxGeometry args={[0.78, 0.26, 1.05]} />
        <meshStandardMaterial color="#0f172a" roughness={0.12} metalness={0.85} />
      </mesh>
      {/* 4. Roof Cap / Emergency Lightbar */}
      <mesh position={[0, 0.83, -0.08]}>
        <boxGeometry args={[0.72, 0.06, 0.92]} />
        <meshStandardMaterial
          color={isEmergency ? "#f8fafc" : bodyColor}
          roughness={0.35}
          metalness={0.5}
        />
      </mesh>
      {isEmergency && (
        <mesh position={[0, 0.92, -0.05]}>
          <boxGeometry args={[0.52, 0.09, 0.16]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={2.2}
          />
        </mesh>
      )}
      {/* 5-8. Four Wheel Assemblies */}
      {[
        [-0.48, 0.17, 0.6],
        [0.48, 0.17, 0.6],
        [-0.48, 0.17, -0.6],
        [0.48, 0.17, -0.6],
      ].map(([wx, wy, wz], idx) => (
        <mesh key={idx} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.17, 0.17, 0.14, 14]} />
          <meshStandardMaterial color="#0f172a" roughness={0.85} metalness={0.1} />
        </mesh>
      ))}
      {/* Headlights */}
      <mesh position={[-0.3, 0.42, 0.99]}>
        <boxGeometry args={[0.2, 0.09, 0.05]} />
        <meshStandardMaterial color="#fef9c3" emissive="#fef08a" emissiveIntensity={1.8} />
      </mesh>
      <mesh position={[0.3, 0.42, 0.99]}>
        <boxGeometry args={[0.2, 0.09, 0.05]} />
        <meshStandardMaterial color="#fef9c3" emissive="#fef08a" emissiveIntensity={1.8} />
      </mesh>
      {/* Taillights */}
      <mesh position={[0, 0.42, -0.99]}>
        <boxGeometry args={[0.76, 0.08, 0.05]} />
        <meshStandardMaterial color="#dc2626" emissive="#ef4444" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

// Extruded real OSM buildings
function UrbanBuildingsLayer({
  buildings,
  project,
  nightMode,
}: {
  buildings: UrbanContextData["buildings"];
  project: (lat: number, lng: number) => [number, number];
  nightMode: boolean;
}) {
  const facadeTex = useMemo(() => createFacadeTexture(nightMode), [nightMode]);

  useEffect(() => {
    return () => {
      facadeTex.dispose();
    };
  }, [facadeTex]);

  const meshes = useMemo(() => {
    return buildings
      .map((b) => {
        if (b.footprint.length < 3) return null;
        const pts = b.footprint.map(([lat, lng]) => project(lat, lng));
        const shape = new THREE.Shape();
        pts.forEach(([x, z], idx) => {
          // Shape lies in XY, rotated -PI/2 around X so shape Y maps to -Z
          if (idx === 0) shape.moveTo(x, -z);
          else shape.lineTo(x, -z);
        });
        shape.closePath();

        const height = Math.max(0.8, Math.min(b.heightMeters * 0.14, 14));
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: height,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.06,
          bevelSegments: 1,
        });
        geo.rotateX(-Math.PI / 2);
        return { id: b.id, geo };
      })
      .filter(Boolean) as Array<{ id: string; geo: THREE.ExtrudeGeometry }>;
  }, [buildings, project]);

  useEffect(() => {
    return () => {
      meshes.forEach((m) => m.geo.dispose());
    };
  }, [meshes]);

  return (
    <group>
      {meshes.map((m) => (
        <mesh key={m.id} geometry={m.geo} castShadow receiveShadow>
          <meshStandardMaterial
            map={facadeTex}
            color={nightMode ? "#94a3b8" : "#f1f5f9"}
            roughness={nightMode ? 0.48 : 0.72}
            metalness={nightMode ? 0.35 : 0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

// Surrounding OSM road network ribbons
function UrbanRoadsLayer({
  roads,
  project,
  nightMode,
}: {
  roads: UrbanContextData["roads"];
  project: (lat: number, lng: number) => [number, number];
  nightMode: boolean;
}) {
  const roadGeos = useMemo(() => {
    const out: Array<{ id: string; geo: THREE.TubeGeometry; major: boolean }> = [];
    for (const r of roads) {
      if (r.points.length < 2) continue;
      const vecs = r.points.map(([lat, lng]) => {
        const [x, z] = project(lat, lng);
        return new THREE.Vector3(x, 0.04, z);
      });
      // Deduplicate consecutive identical points
      const clean = vecs.filter(
        (v, idx) => idx === 0 || v.distanceToSquared(vecs[idx - 1]) > 0.01,
      );
      if (clean.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(clean);
      const major = ["motorway", "trunk", "primary", "secondary"].includes(r.highway);
      const geo = new THREE.TubeGeometry(
        curve,
        Math.min(40, clean.length * 3),
        major ? 0.22 : 0.12,
        4,
        false,
      );
      out.push({ id: r.id, geo, major });
    }
    return out;
  }, [roads, project]);

  useEffect(() => {
    return () => {
      roadGeos.forEach((r) => r.geo.dispose());
    };
  }, [roadGeos]);

  return (
    <group>
      {roadGeos.map((r) => (
        <mesh key={r.id} geometry={r.geo}>
          <meshStandardMaterial
            color={
              r.major
                ? nightMode
                  ? "#334155"
                  : "#94a3b8"
                : nightMode
                  ? "#1e293b"
                  : "#cbd5e1"
            }
            roughness={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

// Landmark Pin (composite beacon: base ring + stem + floating diamond)
function SpatialMarker({
  position,
  color,
  label,
  sublabel,
}: {
  position: [number, number, number];
  color: string;
  label: string;
  sublabel?: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.72, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 2.0, 10]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh position={[0, 2.25, 0]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} roughness={0.2} metalness={0.5} />
      </mesh>
      <Html position={[0, 3.1, 0]} center distanceFactor={36} zIndexRange={[10, 0]}>
        <div className="px-2 py-0.5 rounded bg-slate-900/90 text-white text-[11px] font-medium whitespace-nowrap border border-white/15 pointer-events-none select-none">
          {label}
          {sublabel ? <span className="text-slate-300 ml-1">· {sublabel}</span> : null}
        </div>
      </Html>
    </group>
  );
}

function DigitalTwinScene({
  routeResult,
  selectedRouteId,
  discoveredPOIs,
  communityReports,
  urbanContext,
  nightMode,
  cameraPreset,
  paused,
  isSoftwareGl,
  onSelectRoute,
}: {
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  discoveredPOIs: DiscoveredPOI[];
  communityReports: CommunityReport[];
  urbanContext: UrbanContextData | null;
  nightMode: boolean;
  cameraPreset: CameraPreset;
  paused: boolean;
  isSoftwareGl: boolean;
  onSelectRoute: (routeId: string) => void;
}) {
  const controlsRef = useRef<any>(null);
  const heroPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const heroAheadRef = useRef(new THREE.Vector3(0, 0, 1));
  const userInteractingRef = useRef(false);

  const groundTex = useMemo(() => createGroundTexture(nightMode), [nightMode]);
  useEffect(() => () => groundTex.dispose(), [groundTex]);

  const activeAlt = useMemo(() => {
    if (!routeResult) return null;
    return (
      routeResult.alternatives.find((a) => a.routeId === selectedRouteId) ||
      routeResult.alternatives[0] ||
      null
    );
  }, [routeResult, selectedRouteId]);

  const { centerLat, centerLng, scale } = useMemo(() => {
    if (!routeResult || !activeAlt || activeAlt.geometry.length < 2) {
      return { centerLat: 40.7484, centerLng: -73.9857, scale: 0.045 };
    }
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const [lat, lng] of activeAlt.geometry) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    const cLat = (minLat + maxLat) / 2;
    const cLng = (minLng + maxLng) / 2;
    const spanMeters = Math.max(
      400,
      Math.hypot((maxLat - minLat) * 110540, (maxLng - minLng) * 111320 * Math.cos((cLat * Math.PI) / 180)),
    );
    // Fit route span nicely within ~75 world units
    const computedScale = Math.min(0.06, Math.max(0.0025, 72 / spanMeters));
    return { centerLat: cLat, centerLng: cLng, scale: computedScale };
  }, [routeResult, activeAlt]);

  const project = useMemo(
    () => createProjector(centerLat, centerLng, scale),
    [centerLat, centerLng, scale],
  );

  // Build Three.js curves & TubeGeometries for all route alternatives
  const routeMeshes = useMemo(() => {
    if (!routeResult) return [];
    return routeResult.alternatives
      .map((alt) => {
        const vecs = alt.geometry.map(([lat, lng]) => {
          const [x, z] = project(lat, lng);
          return new THREE.Vector3(x, 0.18, z);
        });
        const clean = vecs.filter(
          (v, idx) => idx === 0 || v.distanceToSquared(vecs[idx - 1]) > 0.02,
        );
        if (clean.length < 2) return null;
        const curve = new THREE.CatmullRomCurve3(clean);
        const isSelected = alt.routeId === (activeAlt?.routeId || "");
        const tube = new THREE.TubeGeometry(
          curve,
          Math.min(180, clean.length * 2),
          isSelected ? 0.36 : 0.2,
          8,
          false,
        );
        return { alt, curve, tube, isSelected };
      })
      .filter(Boolean) as Array<{
      alt: PredictiveRouteResult["alternatives"][number];
      curve: THREE.CatmullRomCurve3;
      tube: THREE.TubeGeometry;
      isSelected: boolean;
    }>;
  }, [routeResult, activeAlt, project]);

  useEffect(() => {
    return () => {
      routeMeshes.forEach((m) => m.tube.dispose());
    };
  }, [routeMeshes]);

  const activeRouteMesh = routeMeshes.find((m) => m.isSelected) || routeMeshes[0] || null;

  // Smooth damped camera preset transitions
  useFrame((state, delta) => {
    if (userInteractingRef.current) return;
    const cam = state.camera;
    const controls = controlsRef.current;

    if (cameraPreset === "follow" && activeRouteMesh) {
      const dir = _vAhead
        .copy(heroAheadRef.current)
        .sub(heroPosRef.current)
        .normalize();
      _vCamTarget
        .copy(heroPosRef.current)
        .addScaledVector(dir, -12)
        .add(new THREE.Vector3(0, 7.5, 0));
      _vLookTarget.copy(heroPosRef.current).addScaledVector(dir, 5);
    } else if (cameraPreset === "topdown") {
      _vCamTarget.set(0, 74, 6);
      _vLookTarget.set(0, 0, 0);
    } else {
      _vCamTarget.set(34, 34, 42);
      _vLookTarget.set(0, 0, 0);
    }

    const lambda = 4.2;
    cam.position.x = THREE.MathUtils.damp(cam.position.x, _vCamTarget.x, lambda, delta);
    cam.position.y = THREE.MathUtils.damp(cam.position.y, _vCamTarget.y, lambda, delta);
    cam.position.z = THREE.MathUtils.damp(cam.position.z, _vCamTarget.z, lambda, delta);

    if (controls) {
      controls.target.x = THREE.MathUtils.damp(controls.target.x, _vLookTarget.x, lambda, delta);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, _vLookTarget.y, lambda, delta);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, _vLookTarget.z, lambda, delta);
      controls.update();
    }
  });

  const isEmergency = Boolean(routeResult?.isEmergency);

  return (
    <>
      <StudioEnvironment nightMode={nightMode} />

      {/* Warm/Cool Studio Lighting Rig */}
      <hemisphereLight
        args={[
          nightMode ? "#38bdf8" : "#e0f2fe",
          nightMode ? "#0f172a" : "#94a3b8",
          nightMode ? 0.55 : 0.9,
        ]}
      />
      <directionalLight
        position={[45, 65, 35]}
        intensity={nightMode ? 0.95 : 1.55}
        color={nightMode ? "#93c5fd" : "#fff7ed"}
        castShadow={!isSoftwareGl}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      <directionalLight
        position={[-40, 25, -35]}
        intensity={nightMode ? 0.45 : 0.4}
        color="#60a5fa"
      />

      {/* Extended Horizon Ground Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[420, 420]} />
        <meshStandardMaterial map={groundTex} roughness={0.92} metalness={0.05} />
      </mesh>

      {/* Real OpenStreetMap Extruded Buildings & Surrounding Roads */}
      {urbanContext && urbanContext.buildings.length > 0 && (
        <UrbanBuildingsLayer
          buildings={urbanContext.buildings}
          project={project}
          nightMode={nightMode}
        />
      )}
      {urbanContext && urbanContext.roads.length > 0 && (
        <UrbanRoadsLayer
          roads={urbanContext.roads}
          project={project}
          nightMode={nightMode}
        />
      )}

      {/* Synchronized OSRM Route Ribbons */}
      {routeMeshes.map(({ alt, tube, isSelected }) => (
        <mesh
          key={alt.routeId}
          geometry={tube}
          onClick={(e) => {
            e.stopPropagation();
            onSelectRoute(alt.routeId);
          }}
        >
          <meshStandardMaterial
            color={
              isSelected
                ? isEmergency
                  ? "#ef4444"
                  : "#2563eb"
                : nightMode
                  ? "#64748b"
                  : "#94a3b8"
            }
            emissive={
              isSelected ? (isEmergency ? "#dc2626" : "#1d4ed8") : "#000000"
            }
            emissiveIntensity={isSelected ? (nightMode ? 1.1 : 0.35) : 0}
            roughness={0.35}
            transparent={!isSelected}
            opacity={isSelected ? 1 : 0.55}
          />
        </mesh>
      ))}

      {/* Moving Composite Vehicles along active OSRM route */}
      {activeRouteMesh && (
        <>
          <CompositeVehicle
            curve={activeRouteMesh.curve}
            speed={0.055}
            offset={0.02}
            isHero
            isEmergency={isEmergency}
            paused={paused}
            onHeroTransform={(p, a) => {
              heroPosRef.current.copy(p);
              heroAheadRef.current.copy(a);
            }}
          />
          <CompositeVehicle
            curve={activeRouteMesh.curve}
            speed={0.042}
            offset={0.38}
            paused={paused}
          />
          <CompositeVehicle
            curve={activeRouteMesh.curve}
            speed={0.048}
            offset={0.71}
            paused={paused}
          />
        </>
      )}

      {/* Origin, Waypoints, Destination 3D Markers */}
      {routeResult && (() => {
        const [ox, oz] = project(routeResult.origin.lat, routeResult.origin.lng);
        const [dx, dz] = project(
          routeResult.destination.lat,
          routeResult.destination.lng,
        );
        return (
          <>
            <SpatialMarker
              position={[ox, 0, oz]}
              color="#16a34a"
              label="Origin"
              sublabel={routeResult.origin.label || routeResult.origin.address.split(",")[0]}
            />
            {routeResult.waypoints.map((wp, idx) => {
              const [wx, wz] = project(wp.lat, wp.lng);
              return (
                <SpatialMarker
                  key={wp.id}
                  position={[wx, 0, wz]}
                  color="#d97706"
                  label={`Stop ${idx + 1}`}
                  sublabel={wp.label || wp.address.split(",")[0]}
                />
              );
            })}
            <SpatialMarker
              position={[dx, 0, dz]}
              color={isEmergency ? "#dc2626" : "#2563eb"}
              label={isEmergency ? "Emergency Dest" : "Destination"}
              sublabel={
                routeResult.destination.label ||
                routeResult.destination.address.split(",")[0]
              }
            />
          </>
        );
      })()}

      {/* Discovered Parking / Stop / Emergency POIs */}
      {discoveredPOIs.slice(0, 10).map((poi) => {
        const [px, pz] = project(poi.lat, poi.lng);
        const color =
          poi.category === "hospital" || poi.category === "fire"
            ? "#dc2626"
            : poi.category === "charging"
              ? "#059669"
              : poi.category === "parking"
                ? "#4f46e5"
                : "#0d9488";
        return (
          <group key={poi.id} position={[px, 0, pz]}>
            <mesh position={[0, 0.75, 0]}>
              <cylinderGeometry args={[0.24, 0.1, 1.4, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
            </mesh>
          </group>
        );
      })}

      {/* Community Road Hazard Markers */}
      {communityReports.map((rep) => {
        const [rx, rz] = project(rep.lat, rep.lng);
        const color =
          rep.severity === "high"
            ? "#dc2626"
            : rep.severity === "moderate"
              ? "#f59e0b"
              : "#64748b";
        return (
          <SpatialMarker
            key={rep._id}
            position={[rx, 0, rz]}
            color={color}
            label={rep.type.replace("_", " ")}
            sublabel={rep.severity}
          />
        );
      })}

      <OrbitControls
        ref={controlsRef}
        enableDamping={!isSoftwareGl}
        dampingFactor={0.07}
        maxPolarAngle={Math.PI / 2.08}
        minDistance={8}
        maxDistance={150}
        onStart={() => {
          userInteractingRef.current = true;
        }}
      />
    </>
  );
}

export default function UrbanDigitalTwin3D(props: UrbanDigitalTwin3DProps) {
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("overview");
  const [paused, setPaused] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  const isSoftwareGl = useMemo(() => detectSoftwareGl(), []);

  if (contextLost) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-200 p-6 text-center">
        <p className="font-semibold text-base mb-2">3D WebGL context temporarily suspended</p>
        <p className="text-xs text-slate-400 mb-4">
          Switch to 2D Map view or restore the 3D viewport below.
        </p>
        <button
          type="button"
          onClick={() => setContextLost(false)}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium"
        >
          Restore 3D Twin
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none">
      <Canvas
        shadows={!isSoftwareGl}
        dpr={isSoftwareGl ? 1 : [1, 2]}
        camera={{ position: [34, 34, 42], fov: 46, near: 0.2, far: 600 }}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          const dom = gl.domElement;
          dom.addEventListener("webglcontextlost", (ev) => {
            ev.preventDefault();
            setContextLost(true);
          });
          dom.addEventListener("webglcontextrestored", () => {
            setContextLost(false);
          });
        }}
      >
        <DigitalTwinScene
          routeResult={props.routeResult}
          selectedRouteId={props.selectedRouteId}
          discoveredPOIs={props.discoveredPOIs}
          communityReports={props.communityReports}
          urbanContext={props.urbanContext}
          nightMode={props.nightMode}
          cameraPreset={cameraPreset}
          paused={paused}
          isSoftwareGl={isSoftwareGl}
          onSelectRoute={props.onSelectRoute}
        />
      </Canvas>

      {/* Top-Left Minimal Spatial Context Label (solid opaque bg — no backdrop-blur over WebGL) */}
      <div className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-slate-900/90 text-slate-100 border border-slate-700 text-xs flex items-center gap-2">
        <span className="font-semibold">3D Urban Digital Twin</span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-300 font-mono tabular-nums">
          {props.urbanContext?.buildings.length
            ? `${props.urbanContext.buildings.length} OSM buildings · ${props.urbanContext.roads.length} roads`
            : props.routeResult
              ? "Active OSRM Corridor"
              : "Plan a route to sync 3D corridor"}
        </span>
      </div>

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="mb-1 px-3 py-1 rounded-md bg-slate-900/90 text-slate-200 border border-slate-700 text-[11px] font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          {dockOpen ? "Hide 3D Controls" : "Show 3D Controls"}
        </button>

        {dockOpen && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/95 border border-slate-700 text-xs text-slate-100 shadow-lg">
            {(["overview", "follow", "topdown"] as CameraPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCameraPreset(preset)}
                className={`px-2.5 py-1.5 rounded-md font-medium capitalize transition-colors whitespace-nowrap ${
                  cameraPreset === preset
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {preset === "topdown" ? "Top-Down" : preset === "follow" ? "Follow Vehicle" : "Overview"}
              </button>
            ))}

            <span className="h-4 w-px bg-slate-700 mx-1" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="px-2.5 py-1.5 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 font-medium whitespace-nowrap"
            >
              {paused ? "Resume Motion" : "Pause Motion"}
            </button>

            <button
              type="button"
              onClick={props.onToggleNightMode}
              className="px-2.5 py-1.5 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 font-medium whitespace-nowrap"
            >
              {props.nightMode ? "Day Scene" : "Night Scene"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
