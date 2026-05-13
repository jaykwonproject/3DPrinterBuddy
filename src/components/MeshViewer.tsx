"use client";

import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Box3, BufferGeometry, Group, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface MeshDimensions {
  width: number; // along X axis, mm
  height: number; // along Y axis, mm
  depth: number; // along Z axis, mm
  scale: number; // multiplier from mesh units to mm
  pointDistanceMesh: number;
  pointDistanceMm: number;
}

interface MeshViewerProps {
  glb: Uint8Array;
  onCalibrated: (dims: MeshDimensions) => void;
}

const REFERENCE_HINT =
  "Tip: a credit card is 85.6 × 53.98 mm — useful for calibrating.";

export default function MeshViewer({ glb, onCalibrated }: MeshViewerProps) {
  const [scene, setScene] = useState<Group | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Raw mesh-unit bounding box, computed once after the GLB is parsed.
  const meshBox = useMemo(() => {
    if (!scene) return null;
    return new Box3().setFromObject(scene);
  }, [scene]);

  const [points, setPoints] = useState<Vector3[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [distanceInput, setDistanceInput] = useState("85.6");
  const [calibratedDims, setCalibratedDims] = useState<MeshDimensions | null>(
    null,
  );

  // Parse the GLB once per `glb` input.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setScene(null);
    setPoints([]);
    setCalibratedDims(null);
    const buffer = glb.buffer.slice(
      glb.byteOffset,
      glb.byteOffset + glb.byteLength,
    ) as ArrayBuffer;
    new GLTFLoader().parse(
      buffer,
      "",
      (gltf) => {
        if (cancelled) return;
        setScene(gltf.scene);
      },
      (err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setLoadError(`Failed to parse GLB: ${message}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [glb]);

  const handlePick = useCallback(
    (point: Vector3) => {
      if (calibratedDims) return; // locked after calibration
      setPoints((prev) => {
        if (prev.length >= 2) return prev;
        const next = [...prev, point.clone()];
        if (next.length === 2) setShowModal(true);
        return next;
      });
    },
    [calibratedDims],
  );

  function recalibrate() {
    setPoints([]);
    setCalibratedDims(null);
    setShowModal(false);
  }

  function submitDistance() {
    if (points.length !== 2 || !meshBox) return;
    const realMm = Number(distanceInput);
    if (!Number.isFinite(realMm) || realMm <= 0) return;
    const meshDistance = points[0].distanceTo(points[1]);
    if (meshDistance <= 0) return;
    const scale = realMm / meshDistance;
    const size = new Vector3();
    meshBox.getSize(size);
    const dims: MeshDimensions = {
      width: size.x * scale,
      height: size.y * scale,
      depth: size.z * scale,
      scale,
      pointDistanceMesh: meshDistance,
      pointDistanceMm: realMm,
    };
    setCalibratedDims(dims);
    setShowModal(false);
    onCalibrated(dims);
  }

  return (
    <div className="relative">
      <div className="h-96 w-full overflow-hidden rounded border border-zinc-200 bg-zinc-50">
        {loadError ? (
          <div className="flex h-full items-center justify-center p-4 text-sm text-red-700">
            {loadError}
          </div>
        ) : !scene ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Loading mesh…
          </div>
        ) : (
          <Canvas camera={{ position: [2, 2, 2], fov: 35 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[2, 4, 3]} intensity={0.7} />
            <directionalLight position={[-3, -2, -1]} intensity={0.3} />
            <Bounds fit clip observe margin={1.4}>
              <PickableScene scene={scene} onPick={handlePick} />
            </Bounds>
            <Markers points={points} />
            <OrbitControls makeDefault />
          </Canvas>
        )}
      </div>

      <Overlay>
        {!scene ? null : calibratedDims ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-700">
              W: {calibratedDims.width.toFixed(1)} mm · H:{" "}
              {calibratedDims.height.toFixed(1)} mm · D:{" "}
              {calibratedDims.depth.toFixed(1)} mm
            </span>
            <button
              type="button"
              onClick={recalibrate}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs"
            >
              Recalibrate
            </button>
          </div>
        ) : (
          <span className="text-xs text-zinc-700">
            {points.length === 0
              ? "Click two known reference points on the mesh."
              : points.length === 1
                ? "Now click the second reference point."
                : "Enter the distance between the two points."}
          </span>
        )}
      </Overlay>

      {showModal && (
        <DistanceModal
          value={distanceInput}
          onChange={setDistanceInput}
          onSubmit={submitDistance}
          onCancel={recalibrate}
        />
      )}
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
      <div className="pointer-events-auto rounded-full bg-white/90 px-3 py-1 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function PickableScene({
  scene,
  onPick,
}: {
  scene: Group;
  onPick: (point: Vector3) => void;
}) {
  const groupRef = useRef<Group>(null);
  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onPick(event.point);
  }
  return (
    <group ref={groupRef} onPointerDown={handleClick}>
      <primitive object={scene} />
    </group>
  );
}

function Markers({ points }: { points: Vector3[] }) {
  // Sphere radius scales with mesh size — using a tiny world unit. Bounds wraps
  // the scene to a normalized box, so 0.02 reads as small but visible.
  const radius = 0.015;
  return (
    <>
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[radius, 16, 16]} />
          <meshBasicMaterial color={i === 0 ? "#ef4444" : "#10b981"} />
        </mesh>
      ))}
      {points.length === 2 && <Ruler a={points[0]} b={points[1]} />}
    </>
  );
}

function Ruler({ a, b }: { a: Vector3; b: Vector3 }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setFromPoints([a, b]);
    return g;
  }, [a, b]);
  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color="#f59e0b" />
    </line>
  );
}

function DistanceModal({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
      <div className="w-72 rounded-lg bg-white p-4 shadow-lg">
        <h3 className="text-sm font-semibold">Distance between the points</h3>
        <p className="mt-1 text-xs text-zinc-500">{REFERENCE_HINT}</p>
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          className="mt-3 w-full rounded border border-zinc-300 p-2 text-sm"
          autoFocus
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-zinc-300 px-3 py-1 text-xs"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="rounded bg-black px-3 py-1 text-xs font-medium text-white"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
