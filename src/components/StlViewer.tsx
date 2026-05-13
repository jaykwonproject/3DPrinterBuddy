"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, Center, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

interface StlViewerProps {
  stl: Uint8Array;
}

export default function StlViewer({ stl }: StlViewerProps) {
  const geometry = useMemo(() => {
    const buffer = stl.buffer.slice(
      stl.byteOffset,
      stl.byteOffset + stl.byteLength,
    ) as ArrayBuffer;
    const geom = new STLLoader().parse(buffer);
    geom.computeVertexNormals();
    return geom;
  }, [stl]);

  return (
    <div className="h-80 w-full overflow-hidden rounded border border-zinc-200 bg-zinc-50">
      <Canvas camera={{ position: [80, 80, 80], fov: 35 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[100, 100, 100]} intensity={0.8} />
        <directionalLight position={[-100, -100, -50]} intensity={0.3} />
        <Bounds fit clip observe margin={1.2}>
          <Center>
            <mesh geometry={geometry} castShadow receiveShadow>
              <meshStandardMaterial color="#60a5fa" roughness={0.6} />
            </mesh>
          </Center>
        </Bounds>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
