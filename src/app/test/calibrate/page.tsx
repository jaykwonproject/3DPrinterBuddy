"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { MeshDimensions } from "@/components/MeshViewer";

const MeshViewer = dynamic(() => import("@/components/MeshViewer"), {
  ssr: false,
  loading: () => (
    <div className="h-96 w-full rounded border border-zinc-200 bg-zinc-50" />
  ),
});

export default function CalibrateTestPage() {
  const [glb, setGlb] = useState<Uint8Array | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [dims, setDims] = useState<MeshDimensions | null>(null);

  async function handleFile(file: File | null) {
    setGlb(null);
    setDims(null);
    setFilename(null);
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setGlb(new Uint8Array(buffer));
    setFilename(file.name);
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Phase 7 — mesh viewer + scale calibration
        </h1>
        <p className="text-sm text-zinc-500">
          Drop a GLB from Phase 6, click two known points, enter the real
          distance.
        </p>
      </header>

      <input
        type="file"
        accept=".glb,model/gltf-binary"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        className="text-sm"
      />

      {filename && (
        <p className="text-xs text-zinc-500">
          Loaded: <span className="font-mono">{filename}</span>
        </p>
      )}

      {glb && <MeshViewer glb={glb} onCalibrated={setDims} />}

      {dims && (
        <section className="rounded border border-zinc-200 bg-zinc-50 p-3 text-xs">
          <p className="font-medium text-zinc-700">Calibrated dimensions</p>
          <ul className="mt-2 space-y-1 font-mono text-zinc-600">
            <li>width: {dims.width.toFixed(2)} mm</li>
            <li>height: {dims.height.toFixed(2)} mm</li>
            <li>depth: {dims.depth.toFixed(2)} mm</li>
            <li>
              scale: {dims.scale.toFixed(4)} mm/unit · mesh distance:{" "}
              {dims.pointDistanceMesh.toFixed(4)} · real:{" "}
              {dims.pointDistanceMm} mm
            </li>
          </ul>
        </section>
      )}
    </main>
  );
}
