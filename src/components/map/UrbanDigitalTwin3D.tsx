import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  CommunityReport,
  DiscoveredPOI,
  GeoPoint,
  JourneyStop,
  LiveNavigationSnapshot,
  PredictiveRouteResult,
  UrbanBuilding,
  UrbanContextData,
  UrbanPointFeature,
  UrbanPolygonFeature,
  UrbanRoad,
  UrbanTerrainGrid,
} from "../../types/mobility";

interface UrbanDigitalTwin3DProps {
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  destination?: GeoPoint | null;
  waypoints?: JourneyStop[];
  discoveredPOIs: DiscoveredPOI[];
  selectedPOI?: DiscoveredPOI | null;
  onSelectPOI?: (poi: DiscoveredPOI) => void;
  communityReports: CommunityReport[];
  urbanContext: UrbanContextData | null;
  liveNavigation?: LiveNavigationSnapshot | null;
  nightMode: boolean;
  onToggleNightMode: () => void;
  onSelectRoute: (routeId: string) => void;
}

type CameraPreset = "overview" | "follow" | "topdown";

interface InspectableObject {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  heightMeters?: number;
  heightNote?: string;
  address?: string;
  distanceKm?: number;
  distanceRefLabel?: string;
  source: string;
  extra?: string;
}

// Pre-allocated math objects outside frame loop (zero per-frame GC)
const _vPos = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vCamTarget = new THREE.Vector3();
const _vLookTarget = new THREE.Vector3();
const _vUpOffset = new THREE.Vector3(0, 7.2, 0);
const _dummyObj = new THREE.Object3D();

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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function createProjector(centerLat: number, centerLng: number, scale: number) {
  const cosLat = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.2);
  return (lat: number, lng: number): [number, number] => {
    const x = (lng - centerLng) * 111320 * cosLat * scale;
    const z = -(lat - centerLat) * 110540 * scale;
    return [x, z];
  };
}

function createElevationSampler(
  terrain: UrbanTerrainGrid | null | undefined,
  verticalScale: number,
): (lat: number, lng: number) => number {
  if (!terrain || !terrain.available || terrain.elevations.length === 0) {
    return () => 0;
  }
  const { minLat, maxLat, minLng, maxLng } = terrain.bounds;
  const n = terrain.gridSize;
  const base = terrain.baseElevationM;
  const latSpan = Math.max(maxLat - minLat, 1e-6);
  const lngSpan = Math.max(maxLng - minLng, 1e-6);

  return (lat: number, lng: number): number => {
    const u = Math.max(0, Math.min(1, (lng - minLng) / lngSpan));
    const v = Math.max(0, Math.min(1, (lat - minLat) / latSpan));
    const fx = u * (n - 1);
    const fy = v * (n - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(n - 1, x0 + 1);
    const y1 = Math.min(n - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;

    const e00 = terrain.elevations[y0 * n + x0] ?? base;
    const e10 = terrain.elevations[y0 * n + x1] ?? base;
    const e01 = terrain.elevations[y1 * n + x0] ?? base;
    const e11 = terrain.elevations[y1 * n + x1] ?? base;

    const e0 = e00 + (e10 - e00) * tx;
    const e1 = e01 + (e11 - e01) * tx;
    const elev = e0 + (e1 - e0) * ty;
    const relM = elev - base;
    // Clamp vertical relief to keep roads and buildings readable in scene scale
    return Math.max(-4, Math.min(14, relM * verticalScale));
  };
}

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

function createGroundTexture(nightMode: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = nightMode ? "#0b1120" : "#e2e8f0";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = nightMode ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.06)";
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
    scene.fog = new THREE.FogExp2(
      nightMode ? "#090f1d" : "#dbeafe",
      nightMode ? 0.0038 : 0.0028,
    );
  }, [scene, nightMode]);

  return null;
}

// Real Open-Meteo Elevation Terrain Mesh blended into horizon ground
function TerrainMesh({
  terrain,
  centerLat,
  centerLng,
  scale,
  sampleElev,
  nightMode,
}: {
  terrain: UrbanTerrainGrid | null | undefined;
  centerLat: number;
  centerLng: number;
  scale: number;
  sampleElev: (lat: number, lng: number) => number;
  nightMode: boolean;
}) {
  const groundTex = useMemo(() => createGroundTexture(nightMode), [nightMode]);
  useEffect(() => () => groundTex.dispose(), [groundTex]);

  const terrainGeo = useMemo(() => {
    const size = 260;
    const segs = terrain?.available ? 36 : 8;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    if (terrain?.available) {
      const pos = geo.attributes.position;
      const cosLat = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.2);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const lat = centerLat - z / (110540 * scale);
        const lng = centerLng + x / (111320 * cosLat * scale);
        const distFromCenter = Math.hypot(x, z);
        const fade = Math.max(0, 1 - Math.max(0, distFromCenter - 85) / 40);
        const y = sampleElev(lat, lng) * fade;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
    return geo;
  }, [terrain, centerLat, centerLng, scale, sampleElev]);

  useEffect(() => () => terrainGeo.dispose(), [terrainGeo]);

  return (
    <mesh geometry={terrainGeo} position={[0, -0.02, 0]} receiveShadow>
      <meshStandardMaterial
        map={groundTex}
        color={nightMode ? "#1e293b" : "#f1f5f9"}
        roughness={0.93}
        metalness={0.04}
      />
    </mesh>
  );
}

// Single Synced Hero Composite 8-part Vehicle (driven strictly by real GPS or explicitly labeled Preview)
function SyncedHeroVehicle({
  targetPos,
  targetHeadingDeg,
  isEmergency,
  isPreview,
  onHeroTransform,
}: {
  targetPos: [number, number, number];
  targetHeadingDeg: number;
  isEmergency?: boolean;
  isPreview?: boolean;
  onHeroTransform?: (pos: THREE.Vector3, dir: THREE.Vector3) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const currentPosRef = useRef(new THREE.Vector3(...targetPos));
  const currentYawRef = useRef(0);
  const initializedRef = useRef(false);

  // Convert compass bearing (0 = North/-Z, 90 = East/+X) to Three.js Y-rotation where local +Z is forward
  const desiredYaw = useMemo(() => {
    const rad = (targetHeadingDeg * Math.PI) / 180;
    return Math.atan2(Math.sin(rad), -Math.cos(rad));
  }, [targetHeadingDeg]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (!initializedRef.current) {
      currentPosRef.current.set(targetPos[0], targetPos[1], targetPos[2]);
      currentYawRef.current = desiredYaw;
      initializedRef.current = true;
    } else {
      const lambda = 7.5;
      currentPosRef.current.x = THREE.MathUtils.damp(
        currentPosRef.current.x,
        targetPos[0],
        lambda,
        delta,
      );
      currentPosRef.current.y = THREE.MathUtils.damp(
        currentPosRef.current.y,
        targetPos[1],
        lambda,
        delta,
      );
      currentPosRef.current.z = THREE.MathUtils.damp(
        currentPosRef.current.z,
        targetPos[2],
        lambda,
        delta,
      );

      // Shortest angular interpolation
      let diff = desiredYaw - currentYawRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      currentYawRef.current += diff * Math.min(1, delta * 8);
    }

    groupRef.current.position.copy(currentPosRef.current);
    groupRef.current.rotation.set(0, currentYawRef.current, 0);

    if (onHeroTransform) {
      _vPos.copy(currentPosRef.current);
      _vDir.set(Math.sin(currentYawRef.current), 0, Math.cos(currentYawRef.current)).normalize();
      onHeroTransform(_vPos, _vDir);
    }
  });

  const bodyColor = isEmergency ? "#ef4444" : isPreview ? "#7c3aed" : "#2563eb";

  return (
    <group ref={groupRef} scale={1.2}>
      {/* Grounded directional halo */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1.32, 28]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive={bodyColor}
          emissiveIntensity={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>
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
      {/* 4. Roof Cap */}
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

// Extruded real OSM buildings with hover & click inspection
function UrbanBuildingsLayer({
  buildings,
  project,
  sampleElev,
  nightMode,
  selectedId,
  hoveredId,
  onHover,
  onSelect,
}: {
  buildings: UrbanBuilding[];
  project: (lat: number, lng: number) => [number, number];
  sampleElev: (lat: number, lng: number) => number;
  nightMode: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (b: UrbanBuilding | null) => void;
  onSelect: (b: UrbanBuilding) => void;
}) {
  const facadeTex = useMemo(() => createFacadeTexture(nightMode), [nightMode]);
  useEffect(() => () => facadeTex.dispose(), [facadeTex]);

  const meshes = useMemo(() => {
    return buildings
      .map((b) => {
        if (b.footprint.length < 3) return null;
        const pts = b.footprint.map(([lat, lng]) => project(lat, lng));
        const shape = new THREE.Shape();
        pts.forEach(([x, z], idx) => {
          if (idx === 0) shape.moveTo(x, -z);
          else shape.lineTo(x, -z);
        });
        shape.closePath();

        const height = Math.max(0.7, Math.min(b.heightMeters * 0.13, 14));
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: height,
          bevelEnabled: true,
          bevelThickness: 0.05,
          bevelSize: 0.05,
          bevelSegments: 1,
        });
        geo.rotateX(-Math.PI / 2);
        const baseY = sampleElev(b.centerLat, b.centerLng);
        return { b, geo, baseY };
      })
      .filter(Boolean) as Array<{
      b: UrbanBuilding;
      geo: THREE.ExtrudeGeometry;
      baseY: number;
    }>;
  }, [buildings, project, sampleElev]);

  useEffect(() => {
    return () => {
      meshes.forEach((m) => m.geo.dispose());
    };
  }, [meshes]);

  return (
    <group>
      {meshes.map(({ b, geo, baseY }) => {
        const isHighlighted = b.id === selectedId || b.id === hoveredId;
        return (
          <mesh
            key={b.id}
            geometry={geo}
            position={[0, baseY, 0]}
            castShadow
            receiveShadow
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
              onHover(b);
            }}
            onPointerOut={() => {
              document.body.style.cursor = "auto";
              onHover(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(b);
            }}
          >
            <meshStandardMaterial
              map={facadeTex}
              color={
                isHighlighted
                  ? "#60a5fa"
                  : nightMode
                    ? "#94a3b8"
                    : "#f1f5f9"
              }
              emissive={isHighlighted ? "#1d4ed8" : "#000000"}
              emissiveIntensity={isHighlighted ? 0.35 : 0}
              roughness={nightMode ? 0.48 : 0.72}
              metalness={nightMode ? 0.35 : 0.12}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Surrounding OSM Roads + Elevated Bridges with Pillars
function UrbanRoadsLayer({
  roads,
  project,
  sampleElev,
  nightMode,
  onHover,
  onSelect,
}: {
  roads: UrbanRoad[];
  project: (lat: number, lng: number) => [number, number];
  sampleElev: (lat: number, lng: number) => number;
  nightMode: boolean;
  onHover: (r: UrbanRoad | null) => void;
  onSelect: (r: UrbanRoad) => void;
}) {
  const roadGeos = useMemo(() => {
    const out: Array<{
      road: UrbanRoad;
      geo: THREE.TubeGeometry;
      major: boolean;
      pillars: Array<[number, number, number]>;
    }> = [];

    for (const r of roads) {
      if (r.points.length < 2) continue;
      const bridgeLift = r.isBridge ? 0.85 * Math.max(1, r.layer || 1) : 0.05;
      const vecs = r.points.map(([lat, lng]) => {
        const [x, z] = project(lat, lng);
        const y = sampleElev(lat, lng) + bridgeLift;
        return new THREE.Vector3(x, y, z);
      });
      const clean = vecs.filter(
        (v, idx) => idx === 0 || v.distanceToSquared(vecs[idx - 1]) > 0.01,
      );
      if (clean.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(clean);
      const major = ["motorway", "trunk", "primary", "secondary"].includes(r.highway);
      const geo = new THREE.TubeGeometry(
        curve,
        Math.min(40, clean.length * 3),
        major ? 0.24 : 0.13,
        4,
        false,
      );

      const pillars: Array<[number, number, number]> = [];
      if (r.isBridge) {
        const pCount = Math.min(5, Math.max(2, Math.floor(clean.length / 2)));
        for (let i = 0; i < pCount; i++) {
          const pt = curve.getPointAt(pCount === 1 ? 0.5 : i / (pCount - 1));
          pillars.push([pt.x, pt.y - bridgeLift / 2, pt.z]);
        }
      }

      out.push({ road: r, geo, major, pillars });
    }
    return out;
  }, [roads, project, sampleElev]);

  useEffect(() => {
    return () => {
      roadGeos.forEach((r) => r.geo.dispose());
    };
  }, [roadGeos]);

  return (
    <group>
      {roadGeos.map(({ road, geo, major, pillars }) => (
        <group key={road.id}>
          <mesh
            geometry={geo}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
              onHover(road);
            }}
            onPointerOut={() => {
              document.body.style.cursor = "auto";
              onHover(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(road);
            }}
          >
            <meshStandardMaterial
              color={
                road.isBridge
                  ? nightMode
                    ? "#64748b"
                    : "#475569"
                  : major
                    ? nightMode
                      ? "#334155"
                      : "#94a3b8"
                    : nightMode
                      ? "#1e293b"
                      : "#cbd5e1"
              }
              roughness={0.82}
            />
          </mesh>
          {pillars.map(([px, py, pz], idx) => (
            <mesh key={idx} position={[px, py, pz]}>
              <cylinderGeometry args={[0.12, 0.15, 0.9, 8]} />
              <meshStandardMaterial color="#64748b" roughness={0.85} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// Parks & Water Polygons Layer
function UrbanPolygonsLayer({
  features,
  variant,
  project,
  sampleElev,
  nightMode,
  onHover,
  onSelect,
}: {
  features: UrbanPolygonFeature[];
  variant: "park" | "water";
  project: (lat: number, lng: number) => [number, number];
  sampleElev: (lat: number, lng: number) => number;
  nightMode: boolean;
  onHover: (f: UrbanPolygonFeature | null) => void;
  onSelect: (f: UrbanPolygonFeature) => void;
}) {
  const meshes = useMemo(() => {
    return features
      .map((f) => {
        if (f.footprint.length < 3) return null;
        const pts = f.footprint.map(([lat, lng]) => project(lat, lng));
        const shape = new THREE.Shape();
        pts.forEach(([x, z], idx) => {
          if (idx === 0) shape.moveTo(x, -z);
          else shape.lineTo(x, -z);
        });
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        const y = sampleElev(f.centerLat, f.centerLng) + (variant === "water" ? 0.03 : 0.04);
        return { f, geo, y };
      })
      .filter(Boolean) as Array<{
      f: UrbanPolygonFeature;
      geo: THREE.ShapeGeometry;
      y: number;
    }>;
  }, [features, variant, project, sampleElev]);

  useEffect(() => {
    return () => {
      meshes.forEach((m) => m.geo.dispose());
    };
  }, [meshes]);

  const color =
    variant === "water"
      ? nightMode
        ? "#0369a1"
        : "#38bdf8"
      : nightMode
        ? "#14532d"
        : "#4ade80";

  return (
    <group>
      {meshes.map(({ f, geo, y }) => (
        <mesh
          key={f.id}
          geometry={geo}
          position={[0, y, 0]}
          receiveShadow
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
            onHover(f);
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
            onHover(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(f);
          }}
        >
          <meshStandardMaterial
            color={color}
            roughness={variant === "water" ? 0.18 : 0.88}
            metalness={variant === "water" ? 0.45 : 0.02}
          />
        </mesh>
      ))}
    </group>
  );
}

// Instanced Composite Trees (real OSM natural=tree nodes)
function InstancedTreesLayer({
  trees,
  project,
  sampleElev,
  nightMode,
}: {
  trees: UrbanPointFeature[];
  project: (lat: number, lng: number) => [number, number];
  sampleElev: (lat: number, lng: number) => number;
  nightMode: boolean;
}) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const trunkMesh = trunkRef.current;
    const crownMesh = crownRef.current;
    if (!trunkMesh || !crownMesh || trees.length === 0) return;

    trees.forEach((t, i) => {
      const [x, z] = project(t.lat, t.lng);
      const y = sampleElev(t.lat, t.lng);
      const s = 0.85 + ((i * 19) % 5) * 0.1;

      _dummyObj.position.set(x, y + 0.35 * s, z);
      _dummyObj.scale.set(s, s, s);
      _dummyObj.rotation.set(0, 0, 0);
      _dummyObj.updateMatrix();
      trunkMesh.setMatrixAt(i, _dummyObj.matrix);

      _dummyObj.position.set(x, y + 0.98 * s, z);
      _dummyObj.scale.set(s, s, s);
      _dummyObj.updateMatrix();
      crownMesh.setMatrixAt(i, _dummyObj.matrix);
    });

    trunkMesh.instanceMatrix.needsUpdate = true;
    crownMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.computeBoundingSphere();
    crownMesh.computeBoundingSphere();
  }, [trees, project, sampleElev]);

  if (trees.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[0.07, 0.11, 0.7, 6]} />
        <meshStandardMaterial color="#78350f" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, trees.length]}>
        <coneGeometry args={[0.45, 1.15, 7]} />
        <meshStandardMaterial
          color={nightMode ? "#166534" : "#22c55e"}
          roughness={0.82}
        />
      </instancedMesh>
    </group>
  );
}

function BillboardLabel({
  text,
  position = [0, 3.2, 0],
}: {
  text: string;
  position?: [number, number, number];
}) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const fontSize = 26;
    ctx.font = `600 ${fontSize}px "DM Sans", ui-sans-serif, system-ui, sans-serif`;
    const clipped = text.length > 34 ? `${text.slice(0, 33)}…` : text;
    const textWidth = Math.ceil(ctx.measureText(clipped).width);
    const padX = 22;
    const padY = 12;
    const w = Math.max(96, textWidth + padX * 2);
    const h = fontSize + padY * 2;
    canvas.width = w;
    canvas.height = h;

    const r = 12;
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = `600 ${fontSize}px "DM Sans", ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(clipped, w / 2, h / 2 + 1);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return { texture: tex, aspect: w / h };
  }, [text]);

  useEffect(() => () => texture.dispose(), [texture]);

  const heightUnits = 1.4;
  return (
    <sprite position={position} scale={[heightUnits * aspect, heightUnits, 1]} renderOrder={12}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function NativeOrbitControls({
  controlsRef,
  enableDamping,
  dampingFactor,
  maxPolarAngle,
  minDistance,
  maxDistance,
  onStart,
}: {
  controlsRef: MutableRefObject<ThreeOrbitControls | null>;
  enableDamping: boolean;
  dampingFactor: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;
  onStart?: () => void;
}) {
  const { camera, gl } = useThree();
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement);
    controls.enableDamping = enableDamping;
    controls.dampingFactor = dampingFactor;
    controls.maxPolarAngle = maxPolarAngle;
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    const handleStart = () => onStartRef.current?.();
    controls.addEventListener("start", handleStart);
    controlsRef.current = controls;
    return () => {
      controls.removeEventListener("start", handleStart);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [
    camera,
    gl,
    controlsRef,
    enableDamping,
    dampingFactor,
    maxPolarAngle,
    minDistance,
    maxDistance,
  ]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
}

function SpatialMarker({
  position,
  color,
  label,
  sublabel,
  showLabel = true,
  onHover,
  onClick,
}: {
  position: [number, number, number];
  color: string;
  label: string;
  sublabel?: string;
  showLabel?: boolean;
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
}) {
  const displayLabel = sublabel ? `${label} · ${sublabel}` : label;
  return (
    <group
      position={position}
      onPointerOver={(e) => {
        if (!onHover) return;
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        onHover(true);
      }}
      onPointerOut={() => {
        if (!onHover) return;
        document.body.style.cursor = "auto";
        onHover(false);
      }}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.72, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 2.0, 10]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh position={[0, 2.25, 0]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.45}
          roughness={0.2}
          metalness={0.5}
        />
      </mesh>
      {showLabel && <BillboardLabel text={displayLabel} position={[0, 3.35, 0]} />}
    </group>
  );
}

function DigitalTwinScene({
  routeResult,
  selectedRouteId,
  destination,
  waypoints,
  discoveredPOIs,
  selectedPOI,
  onSelectPOI,
  communityReports,
  urbanContext,
  liveNavigation,
  nightMode,
  cameraPreset,
  presetTrigger,
  isSoftwareGl,
  selectedObjId,
  hoveredObjId,
  onHoverObject,
  onSelectObject,
  onSelectRoute,
}: {
  routeResult: PredictiveRouteResult | null;
  selectedRouteId: string | null;
  destination?: GeoPoint | null;
  waypoints?: JourneyStop[];
  discoveredPOIs: DiscoveredPOI[];
  selectedPOI?: DiscoveredPOI | null;
  onSelectPOI?: (poi: DiscoveredPOI) => void;
  communityReports: CommunityReport[];
  urbanContext: UrbanContextData | null;
  liveNavigation?: LiveNavigationSnapshot | null;
  nightMode: boolean;
  cameraPreset: CameraPreset;
  presetTrigger: number;
  isSoftwareGl: boolean;
  selectedObjId: string | null;
  hoveredObjId: string | null;
  onHoverObject: (obj: InspectableObject | null) => void;
  onSelectObject: (obj: InspectableObject) => void;
  onSelectRoute: (routeId: string) => void;
}) {
  const controlsRef = useRef<ThreeOrbitControls | null>(null);
  const heroPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const heroDirRef = useRef(new THREE.Vector3(0, 0, 1));
  const userInteractingRef = useRef(false);

  // Re-enable smooth camera transition whenever user explicitly clicks a camera preset
  useEffect(() => {
    userInteractingRef.current = false;
  }, [cameraPreset, presetTrigger]);

  const activeAlt = useMemo(() => {
    if (!routeResult) return null;
    return (
      routeResult.alternatives.find((a) => a.routeId === selectedRouteId) ||
      routeResult.alternatives[0] ||
      null
    );
  }, [routeResult, selectedRouteId]);

  // Destination-aware projection center & scale (NEVER silently defaults to Manhattan if destination is chosen)
  const { centerLat, centerLng, scale } = useMemo(() => {
    if (routeResult && activeAlt && activeAlt.geometry.length >= 2) {
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
        450,
        Math.hypot(
          (maxLat - minLat) * 110540,
          (maxLng - minLng) * 111320 * Math.cos((cLat * Math.PI) / 180),
        ),
      );
      const computedScale = Math.min(0.06, Math.max(0.0025, 76 / spanMeters));
      return { centerLat: cLat, centerLng: cLng, scale: computedScale };
    }
    if (destination) {
      return { centerLat: destination.lat, centerLng: destination.lng, scale: 0.048 };
    }
    if (liveNavigation?.currentPosition) {
      return {
        centerLat: liveNavigation.currentPosition.lat,
        centerLng: liveNavigation.currentPosition.lng,
        scale: 0.048,
      };
    }
    if (urbanContext && (urbanContext.centerLat !== 0 || urbanContext.centerLng !== 0)) {
      return {
        centerLat: urbanContext.centerLat,
        centerLng: urbanContext.centerLng,
        scale: 0.048,
      };
    }
    return { centerLat: 0, centerLng: 0, scale: 0.045 };
  }, [routeResult, activeAlt, destination, liveNavigation, urbanContext]);

  const project = useMemo(
    () => createProjector(centerLat, centerLng, scale),
    [centerLat, centerLng, scale],
  );

  const sampleElev = useMemo(
    () => createElevationSampler(urbanContext?.terrain, Math.max(0.025, scale * 1.4)),
    [urbanContext?.terrain, scale],
  );

  const refPoint = useMemo(() => {
    if (liveNavigation?.currentPosition) {
      return {
        lat: liveNavigation.currentPosition.lat,
        lng: liveNavigation.currentPosition.lng,
        label: liveNavigation.status === "gps_active" ? "your GPS location" : "preview vehicle",
      };
    }
    const dest = routeResult?.destination || destination;
    if (dest) {
      return {
        lat: dest.lat,
        lng: dest.lng,
        label: dest.label || dest.address.split(",")[0] || "destination",
      };
    }
    return { lat: centerLat, lng: centerLng, label: "scene center" };
  }, [liveNavigation, routeResult, destination, centerLat, centerLng]);

  const makeDist = useCallback(
    (lat: number, lng: number) => ({
      distanceKm: Number(haversineKm(refPoint.lat, refPoint.lng, lat, lng).toFixed(2)),
      distanceRefLabel: refPoint.label,
    }),
    [refPoint],
  );

  // Build route ribbons grounded on terrain
  const routeMeshes = useMemo(() => {
    if (!routeResult) return [];
    return routeResult.alternatives
      .map((alt) => {
        const vecs = alt.geometry.map(([lat, lng]) => {
          const [x, z] = project(lat, lng);
          const y = sampleElev(lat, lng) + 0.22;
          return new THREE.Vector3(x, y, z);
        });
        const clean = vecs.filter(
          (v, idx) => idx === 0 || v.distanceToSquared(vecs[idx - 1]) > 0.02,
        );
        if (clean.length < 2) return null;
        const curve = new THREE.CatmullRomCurve3(clean);
        const isSelected = alt.routeId === (activeAlt?.routeId || "");
        const tube = new THREE.TubeGeometry(
          curve,
          Math.min(200, clean.length * 2),
          isSelected ? 0.38 : 0.2,
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
  }, [routeResult, activeAlt, project, sampleElev]);

  useEffect(() => {
    return () => {
      routeMeshes.forEach((m) => m.tube.dispose());
    };
  }, [routeMeshes]);

  // Hero vehicle position strictly synced to liveNavigation (or parked at route origin when idle)
  const heroVehicleTarget = useMemo(() => {
    if (liveNavigation?.currentPosition) {
      const { lat, lng, heading } = liveNavigation.currentPosition;
      const [x, z] = project(lat, lng);
      const y = sampleElev(lat, lng) + 0.26;
      return {
        pos: [x, y, z] as [number, number, number],
        heading: heading ?? 0,
        isPreview: liveNavigation.status === "preview_demo",
      };
    }
    if (routeResult && activeAlt && activeAlt.geometry.length >= 2) {
      const [lat0, lng0] = activeAlt.geometry[0];
      const [lat1, lng1] = activeAlt.geometry[1];
      const [x0, z0] = project(lat0, lng0);
      const [x1, z1] = project(lat1, lng1);
      const y0 = sampleElev(lat0, lng0) + 0.26;
      const heading = ((Math.atan2(x1 - x0, -(z1 - z0)) * 180) / Math.PI + 360) % 360;
      return {
        pos: [x0, y0, z0] as [number, number, number],
        heading,
        isPreview: false,
      };
    }
    return null;
  }, [liveNavigation, routeResult, activeAlt, project, sampleElev]);

  // Smooth damped camera preset transitions
  useFrame((state, delta) => {
    if (userInteractingRef.current) return;
    const cam = state.camera;
    const controls = controlsRef.current;

    if (cameraPreset === "follow" && heroVehicleTarget) {
      _vCamTarget
        .copy(heroPosRef.current)
        .addScaledVector(heroDirRef.current, -13)
        .add(_vUpOffset);
      _vLookTarget.copy(heroPosRef.current).addScaledVector(heroDirRef.current, 6);
    } else if (cameraPreset === "topdown") {
      _vCamTarget.set(0, 76, 6);
      _vLookTarget.set(0, 0, 0);
    } else {
      _vCamTarget.set(34, 34, 42);
      _vLookTarget.set(0, 0, 0);
    }

    const lambda = 4.5;
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
  const displayedWaypoints = routeResult ? routeResult.waypoints : waypoints || [];

  const toBuildingInspectable = useCallback(
    (b: UrbanBuilding): InspectableObject => ({
      id: b.id,
      name: b.name || `Unnamed ${b.kind || "building"}`,
      category: b.kind || "building",
      lat: b.centerLat,
      lng: b.centerLng,
      heightMeters: b.heightMeters,
      heightNote:
        b.heightSource === "osm_height"
          ? "OSM measured height"
          : b.heightSource === "osm_levels"
            ? "Estimated from OSM building:levels"
            : "Default footprint extrusion (height untagged in OSM)",
      address: b.address,
      ...makeDist(b.centerLat, b.centerLng),
      source: "OpenStreetMap Overpass",
    }),
    [makeDist],
  );

  const toRoadInspectable = useCallback(
    (r: UrbanRoad): InspectableObject => {
      const mid = r.points[Math.floor(r.points.length / 2)] || [centerLat, centerLng];
      return {
        id: r.id,
        name: r.name || `Unnamed ${r.highway} road`,
        category: r.isBridge ? `${r.highway} bridge / overpass` : `${r.highway} road`,
        lat: Number(mid[0].toFixed(6)),
        lng: Number(mid[1].toFixed(6)),
        ...makeDist(mid[0], mid[1]),
        extra: r.lanes ? `${r.lanes} lane(s)` : undefined,
        source: "OpenStreetMap Overpass",
      };
    },
    [centerLat, centerLng, makeDist],
  );

  const toPolygonInspectable = useCallback(
    (f: UrbanPolygonFeature, variant: "park" | "water"): InspectableObject => ({
      id: f.id,
      name: f.name || (variant === "water" ? "Unnamed water body" : "Unnamed park / green space"),
      category: f.kind,
      lat: f.centerLat,
      lng: f.centerLng,
      ...makeDist(f.centerLat, f.centerLng),
      source: "OpenStreetMap Overpass",
    }),
    [makeDist],
  );

  return (
    <>
      <StudioEnvironment nightMode={nightMode} />

      <hemisphereLight
        args={[
          nightMode ? "#38bdf8" : "#e0f2fe",
          nightMode ? "#0f172a" : "#94a3b8",
          nightMode ? 0.55 : 0.92,
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

      {/* Real Open-Meteo Elevation Terrain Mesh */}
      <TerrainMesh
        terrain={urbanContext?.terrain}
        centerLat={centerLat}
        centerLng={centerLng}
        scale={scale}
        sampleElev={sampleElev}
        nightMode={nightMode}
      />

      {/* Real OSM Parks & Water Bodies */}
      {urbanContext && urbanContext.parks.length > 0 && (
        <UrbanPolygonsLayer
          features={urbanContext.parks}
          variant="park"
          project={project}
          sampleElev={sampleElev}
          nightMode={nightMode}
          onHover={(f) => onHoverObject(f ? toPolygonInspectable(f, "park") : null)}
          onSelect={(f) => onSelectObject(toPolygonInspectable(f, "park"))}
        />
      )}
      {urbanContext && urbanContext.waterBodies.length > 0 && (
        <UrbanPolygonsLayer
          features={urbanContext.waterBodies}
          variant="water"
          project={project}
          sampleElev={sampleElev}
          nightMode={nightMode}
          onHover={(f) => onHoverObject(f ? toPolygonInspectable(f, "water") : null)}
          onSelect={(f) => onSelectObject(toPolygonInspectable(f, "water"))}
        />
      )}

      {/* Real OSM Extruded Buildings */}
      {urbanContext && urbanContext.buildings.length > 0 && (
        <UrbanBuildingsLayer
          buildings={urbanContext.buildings}
          project={project}
          sampleElev={sampleElev}
          nightMode={nightMode}
          selectedId={selectedObjId}
          hoveredId={hoveredObjId}
          onHover={(b) => onHoverObject(b ? toBuildingInspectable(b) : null)}
          onSelect={(b) => onSelectObject(toBuildingInspectable(b))}
        />
      )}

      {/* Real OSM Roads & Elevated Bridges */}
      {urbanContext && urbanContext.roads.length > 0 && (
        <UrbanRoadsLayer
          roads={urbanContext.roads}
          project={project}
          sampleElev={sampleElev}
          nightMode={nightMode}
          onHover={(r) => onHoverObject(r ? toRoadInspectable(r) : null)}
          onSelect={(r) => onSelectObject(toRoadInspectable(r))}
        />
      )}

      {/* Real OSM Instanced Trees */}
      {urbanContext && urbanContext.trees.length > 0 && (
        <InstancedTreesLayer
          trees={urbanContext.trees}
          project={project}
          sampleElev={sampleElev}
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

      {/* Single Synchronized Hero Vehicle (GPS or explicitly labeled Preview) — zero fake traffic cars */}
      {heroVehicleTarget && (
        <SyncedHeroVehicle
          targetPos={heroVehicleTarget.pos}
          targetHeadingDeg={heroVehicleTarget.heading}
          isEmergency={isEmergency}
          isPreview={heroVehicleTarget.isPreview}
          onHeroTransform={(p, d) => {
            heroPosRef.current.copy(p);
            heroDirRef.current.copy(d);
          }}
        />
      )}

      {/* Origin, Waypoints, Destination 3D Beacons */}
      {routeResult && (() => {
        const [ox, oz] = project(routeResult.origin.lat, routeResult.origin.lng);
        const oy = sampleElev(routeResult.origin.lat, routeResult.origin.lng);
        const [dx, dz] = project(
          routeResult.destination.lat,
          routeResult.destination.lng,
        );
        const dy = sampleElev(routeResult.destination.lat, routeResult.destination.lng);

        const originObj: InspectableObject = {
          id: "origin_pin",
          name: routeResult.origin.label || routeResult.origin.address.split(",")[0],
          category: "Route Origin",
          lat: routeResult.origin.lat,
          lng: routeResult.origin.lng,
          address: routeResult.origin.address,
          ...makeDist(routeResult.origin.lat, routeResult.origin.lng),
          source: "OpenStreetMap Nominatim",
        };
        const destObj: InspectableObject = {
          id: "dest_pin",
          name: routeResult.destination.label || routeResult.destination.address.split(",")[0],
          category: isEmergency ? "Emergency Destination" : "Route Destination",
          lat: routeResult.destination.lat,
          lng: routeResult.destination.lng,
          address: routeResult.destination.address,
          ...makeDist(routeResult.destination.lat, routeResult.destination.lng),
          source: "OpenStreetMap Nominatim",
        };

        return (
          <>
            <SpatialMarker
              position={[ox, oy, oz]}
              color="#16a34a"
              label="Origin"
              sublabel={originObj.name}
              onHover={(h) => onHoverObject(h ? originObj : null)}
              onClick={() => onSelectObject(originObj)}
            />
            {displayedWaypoints.map((wp, idx) => {
              const [wx, wz] = project(wp.lat, wp.lng);
              const wy = sampleElev(wp.lat, wp.lng);
              const wpObj: InspectableObject = {
                id: wp.id,
                name: wp.label || wp.address.split(",")[0],
                category: `Route Stop #${idx + 1}`,
                lat: wp.lat,
                lng: wp.lng,
                address: wp.address,
                ...makeDist(wp.lat, wp.lng),
                source: "Journey Waypoint",
              };
              return (
                <SpatialMarker
                  key={wp.id}
                  position={[wx, wy, wz]}
                  color="#d97706"
                  label={`Stop ${idx + 1}`}
                  sublabel={wpObj.name}
                  onHover={(h) => onHoverObject(h ? wpObj : null)}
                  onClick={() => onSelectObject(wpObj)}
                />
              );
            })}
            <SpatialMarker
              position={[dx, dy, dz]}
              color={isEmergency ? "#dc2626" : "#2563eb"}
              label={isEmergency ? "Emergency Dest" : "Destination"}
              sublabel={destObj.name}
              onHover={(h) => onHoverObject(h ? destObj : null)}
              onClick={() => onSelectObject(destObj)}
            />
          </>
        );
      })()}

      {/* Destination marker even before full OSRM route is calculated */}
      {!routeResult && destination && (() => {
        const [dx, dz] = project(destination.lat, destination.lng);
        const dy = sampleElev(destination.lat, destination.lng);
        const destObj: InspectableObject = {
          id: "dest_only_pin",
          name: destination.label || destination.address.split(",")[0],
          category: "Selected Destination",
          lat: destination.lat,
          lng: destination.lng,
          address: destination.address,
          source: "OpenStreetMap Nominatim",
        };
        return (
          <SpatialMarker
            position={[dx, dy, dz]}
            color="#2563eb"
            label="Destination"
            sublabel={destObj.name}
            onHover={(h) => onHoverObject(h ? destObj : null)}
            onClick={() => onSelectObject(destObj)}
          />
        );
      })()}

      {/* Real OSM Named Landmarks */}
      {urbanContext?.landmarks.slice(0, 14).map((lm, idx) => {
        const [lx, lz] = project(lm.lat, lm.lng);
        const ly = sampleElev(lm.lat, lm.lng);
        const lmObj: InspectableObject = {
          id: lm.id,
          name: lm.name || "Unnamed landmark",
          category: lm.category,
          lat: lm.lat,
          lng: lm.lng,
          address: lm.address,
          ...makeDist(lm.lat, lm.lng),
          source: urbanContext.source,
        };
        return (
          <SpatialMarker
            key={lm.id}
            position={[lx, ly, lz]}
            color="#0d9488"
            label={lm.name || lm.category}
            showLabel={idx < 5 || selectedObjId === lm.id}
            onHover={(h) => onHoverObject(h ? lmObj : null)}
            onClick={() => onSelectObject(lmObj)}
          />
        );
      })}

      {/* Synchronized Discovered Stops / POIs (clicking selects across 2D + 3D + Stops panel) */}
      {discoveredPOIs.slice(0, 15).map((poi) => {
        const [px, pz] = project(poi.lat, poi.lng);
        const py = sampleElev(poi.lat, poi.lng);
        const isSel = selectedPOI?.id === poi.id;
        const color =
          poi.category === "hospital" || poi.category === "fire"
            ? "#dc2626"
            : poi.category === "charging"
              ? "#059669"
              : poi.category === "parking"
                ? "#4f46e5"
                : "#0d9488";
        const poiObj: InspectableObject = {
          id: poi.id,
          name: poi.name,
          category: poi.category,
          lat: poi.lat,
          lng: poi.lng,
          address: poi.address,
          distanceKm: poi.distanceKm,
          distanceRefLabel: poi.referenceLabel,
          extra: poi.openingHours ? `Hours: ${poi.openingHours}` : poi.availabilityStatus,
          source: poi.source,
        };
        return (
          <group
            key={poi.id}
            position={[px, py, pz]}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
              onHoverObject(poiObj);
            }}
            onPointerOut={() => {
              document.body.style.cursor = "auto";
              onHoverObject(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectObject(poiObj);
              onSelectPOI?.(poi);
            }}
          >
            <mesh position={[0, isSel ? 1.1 : 0.78, 0]}>
              <cylinderGeometry args={[isSel ? 0.34 : 0.24, 0.12, isSel ? 2.1 : 1.45, 10]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isSel ? 0.9 : 0.35}
              />
            </mesh>
            {isSel && <BillboardLabel text={poi.name} position={[0, 2.9, 0]} />}
          </group>
        );
      })}

      {/* Community Road Hazard Markers */}
      {communityReports.map((rep) => {
        const [rx, rz] = project(rep.lat, rep.lng);
        const ry = sampleElev(rep.lat, rep.lng);
        const color =
          rep.severity === "high"
            ? "#dc2626"
            : rep.severity === "moderate"
              ? "#f59e0b"
              : "#64748b";
        const repObj: InspectableObject = {
          id: rep._id,
          name: `Community ${rep.type.replace("_", " ")}`,
          category: `Road Report (${rep.severity})`,
          lat: rep.lat,
          lng: rep.lng,
          address: rep.address,
          ...makeDist(rep.lat, rep.lng),
          extra: rep.description,
          source: "Community Submitted Report",
        };
        return (
          <SpatialMarker
            key={rep._id}
            position={[rx, ry, rz]}
            color={color}
            label={rep.type.replace("_", " ")}
            sublabel={rep.severity}
            onHover={(h) => onHoverObject(h ? repObj : null)}
            onClick={() => onSelectObject(repObj)}
          />
        );
      })}

      <NativeOrbitControls
        controlsRef={controlsRef}
        enableDamping={!isSoftwareGl}
        dampingFactor={0.07}
        maxPolarAngle={Math.PI / 2.08}
        minDistance={8}
        maxDistance={155}
        onStart={() => {
          userInteractingRef.current = true;
        }}
      />
    </>
  );
}

export default function UrbanDigitalTwin3D(props: UrbanDigitalTwin3DProps) {
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("overview");
  const [presetTrigger, setPresetTrigger] = useState(0);
  const [dockOpen, setDockOpen] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  const [hoveredObj, setHoveredObj] = useState<InspectableObject | null>(null);
  const [selectedObj, setSelectedObj] = useState<InspectableObject | null>(null);

  const isSoftwareGl = useMemo(() => detectSoftwareGl(), []);

  // Auto-switch camera to Follow when navigation starts
  const isNavActive = Boolean(props.liveNavigation?.isNavigating);
  useEffect(() => {
    if (isNavActive) {
      setCameraPreset("follow");
      setPresetTrigger((n) => n + 1);
    }
  }, [isNavActive]);

  // Clear inspected object if destination changes
  const destKey = props.routeResult
    ? `${props.routeResult.destination.lat.toFixed(4)},${props.routeResult.destination.lng.toFixed(4)}`
    : props.destination
      ? `${props.destination.lat.toFixed(4)},${props.destination.lng.toFixed(4)}`
      : "";
  useEffect(() => {
    setSelectedObj(null);
    setHoveredObj(null);
  }, [destKey]);

  const hasGeoContext = Boolean(
    props.routeResult ||
      props.destination ||
      props.liveNavigation?.currentPosition ||
      (props.urbanContext && (props.urbanContext.centerLat !== 0 || props.urbanContext.centerLng !== 0)),
  );

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

  const urbanSummary = (() => {
    const u = props.urbanContext;
    if (!u) {
      return props.routeResult
        ? "Loading real geographical 3D context..."
        : props.destination
          ? `Syncing 3D context for ${props.destination.label || "destination"}...`
          : "Select a destination or route to load 3D Digital Twin";
    }
    const parts: string[] = [];
    if (u.buildings.length > 0) parts.push(`${u.buildings.length} buildings`);
    if (u.roads.length > 0) parts.push(`${u.roads.length} roads`);
    if (u.parks.length > 0) parts.push(`${u.parks.length} parks`);
    if (u.waterBodies.length > 0) parts.push(`${u.waterBodies.length} water`);
    if (u.landmarks.length > 0) parts.push(`${u.landmarks.length} landmarks`);
    if (u.terrain?.available) parts.push(`DEM ${u.terrain.baseElevationM}m`);
    return parts.length > 0 ? parts.join(" · ") : "OSRM Corridor + Terrain Active";
  })();

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none">
      <Canvas
        shadows={!isSoftwareGl}
        dpr={isSoftwareGl ? 1 : [1, 2]}
        camera={{ position: [34, 34, 42], fov: 46, near: 0.2, far: 650 }}
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
        onPointerMissed={() => setSelectedObj(null)}
      >
        <DigitalTwinScene
          routeResult={props.routeResult}
          selectedRouteId={props.selectedRouteId}
          destination={props.destination}
          waypoints={props.waypoints}
          discoveredPOIs={props.discoveredPOIs}
          selectedPOI={props.selectedPOI}
          onSelectPOI={props.onSelectPOI}
          communityReports={props.communityReports}
          urbanContext={props.urbanContext}
          liveNavigation={props.liveNavigation}
          nightMode={props.nightMode}
          cameraPreset={cameraPreset}
          presetTrigger={presetTrigger}
          isSoftwareGl={isSoftwareGl}
          selectedObjId={selectedObj?.id ?? null}
          hoveredObjId={hoveredObj?.id ?? null}
          onHoverObject={setHoveredObj}
          onSelectObject={setSelectedObj}
          onSelectRoute={props.onSelectRoute}
        />
      </Canvas>

      {/* Top-Left Minimal Spatial Context Label (solid opaque bg — zero backdrop-blur over WebGL) */}
      <div className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-slate-900/95 text-slate-100 border border-slate-700 text-xs flex flex-wrap items-center gap-2 max-w-[70%]">
        <span className="font-semibold">3D Digital Twin</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-300 font-mono tabular-nums text-[11px]">
          {urbanSummary}
        </span>
      </div>

      {/* Empty Destination Prompt */}
      {!hasGeoContext && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
          <div className="px-4 py-3 rounded-xl bg-slate-900/95 border border-slate-700 text-center max-w-sm">
            <p className="text-xs font-semibold text-slate-100">
              Destination-Aware 3D Digital Twin
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Enter an origin and destination in Planner to load real OpenStreetMap roads, buildings, parks, landmarks, and Open-Meteo terrain elevation.
            </p>
          </div>
        </div>
      )}

      {/* Top-Right Clickable 3D Object Details Inspector (compact, dismissible, solid opaque bg) */}
      {selectedObj && (
        <div className="absolute top-3 right-3 z-20 w-72 max-w-[calc(100%-1.5rem)] rounded-xl bg-slate-900/95 border border-slate-700 p-3 text-xs text-slate-100 shadow-xl space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-100 leading-snug">{selectedObj.name}</p>
              <p className="text-[11px] text-blue-300 capitalize">{selectedObj.category}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedObj(null)}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
            >
              Close
            </button>
          </div>
          {selectedObj.address && (
            <p className="text-[11px] text-slate-300 leading-snug">
              <span className="text-slate-400">Address:</span> {selectedObj.address}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800 font-mono tabular-nums text-[11px]">
            <div>
              <span className="block font-sans text-[10px] text-slate-400">Coordinates</span>
              <span className="text-slate-200">
                {selectedObj.lat.toFixed(5)}, {selectedObj.lng.toFixed(5)}
              </span>
            </div>
            {selectedObj.distanceKm !== undefined && (
              <div>
                <span className="block font-sans text-[10px] text-slate-400">
                  Distance{selectedObj.distanceRefLabel ? ` (${selectedObj.distanceRefLabel})` : ""}
                </span>
                <span className="text-slate-200">{selectedObj.distanceKm.toFixed(2)} km</span>
              </div>
            )}
          </div>
          {selectedObj.heightMeters !== undefined && (
            <p className="text-[11px] text-slate-300">
              <span className="text-slate-400">Height:</span>{" "}
              <span className="font-mono">{selectedObj.heightMeters} m</span>{" "}
              {selectedObj.heightNote ? `(${selectedObj.heightNote})` : ""}
            </p>
          )}
          {selectedObj.extra && (
            <p className="text-[11px] text-slate-300">{selectedObj.extra}</p>
          )}
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
            Source: {selectedObj.source}
          </p>
        </div>
      )}

      {/* Hover Tooltip Bar (non-occluding, solid opaque bg) */}
      {hoveredObj && hoveredObj.id !== selectedObj?.id && (
        <div className="absolute bottom-20 left-3 z-10 px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-slate-700 text-[11px] text-slate-100 pointer-events-none">
          <span className="font-semibold">{hoveredObj.name}</span>
          <span className="text-slate-400"> · {hoveredObj.category}</span>
          {hoveredObj.distanceKm !== undefined && (
            <span className="font-mono text-blue-300"> · {hoveredObj.distanceKm.toFixed(2)} km</span>
          )}
          <span className="text-slate-400"> (click for details)</span>
        </div>
      )}

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="mb-1 px-3 py-1 rounded-md bg-slate-900/95 text-slate-200 border border-slate-700 text-[11px] font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          {dockOpen ? "Hide 3D Controls" : "Show 3D Controls"}
        </button>

        {dockOpen && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/95 border border-slate-700 text-xs text-slate-100 shadow-lg">
            {(["overview", "follow", "topdown"] as CameraPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setCameraPreset(preset);
                  setPresetTrigger((n) => n + 1);
                }}
                className={`px-2.5 py-1.5 rounded-md font-medium capitalize transition-colors whitespace-nowrap ${
                  cameraPreset === preset
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {preset === "topdown"
                  ? "Top-Down"
                  : preset === "follow"
                    ? "Follow Vehicle"
                    : "Overview"}
              </button>
            ))}

            <span className="h-4 w-px bg-slate-700 mx-1" aria-hidden="true" />

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
