"use client";

import { useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; bytes: number }
  | {
      kind: "ready";
      glb: Uint8Array;
      mimeType: string;
      elapsedMs: number;
      origName?: string;
    }
  | { kind: "error"; message: string };

export default function MeshTestPage() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleGenerate() {
    if (!photo) return;
    setStatus({ kind: "uploading", bytes: photo.size });
    const t0 = performance.now();
    try {
      const form = new FormData();
      form.append("photo", photo, photo.name);
      const res = await fetch("/api/generate-mesh", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const buffer = await res.arrayBuffer();
      const mimeType = res.headers.get("content-type") || "model/gltf-binary";
      const disposition = res.headers.get("content-disposition") || "";
      const origName = /filename="([^"]+)"/.exec(disposition)?.[1];
      setStatus({
        kind: "ready",
        glb: new Uint8Array(buffer),
        mimeType,
        elapsedMs: Math.round(performance.now() - t0),
        origName,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleDownload() {
    if (status.kind !== "ready") return;
    const blob = new Blob([new Uint8Array(status.glb)], { type: status.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = status.origName?.endsWith(".glb") ? status.origName : "mesh.glb";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Phase 6 — HF Space mesh test
        </h1>
        <p className="text-sm text-zinc-500">
          Posts the photo to /api/generate-mesh → Hunyuan3D-2 → returns GLB.
          Cold starts can take several minutes; first call queues for GPU.
        </p>
      </header>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        disabled={status.kind === "uploading"}
        className="text-sm"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!photo || status.kind === "uploading"}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {status.kind === "uploading" ? "Generating mesh…" : "Generate mesh"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={status.kind !== "ready"}
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Download GLB
        </button>
      </div>

      <pre className="rounded bg-zinc-50 p-3 text-xs text-zinc-700">
        {renderStatus(status)}
      </pre>

      {status.kind === "ready" && (
        <p className="text-xs text-zinc-500">
          To verify: download the GLB and open
          https://gltf-viewer.donmccurdy.com/ — drop the file in.
        </p>
      )}
    </main>
  );
}

function renderStatus(status: Status): string {
  switch (status.kind) {
    case "idle":
      return "Idle. Pick a photo and click Generate mesh.";
    case "uploading":
      return `Posting ${(status.bytes / 1024).toFixed(1)} KB photo, waiting for HF Space…`;
    case "ready": {
      const magic = String.fromCharCode(
        status.glb[0],
        status.glb[1],
        status.glb[2],
        status.glb[3],
      );
      return [
        `GLB received: ${status.glb.byteLength.toLocaleString()} bytes`,
        `elapsed: ${(status.elapsedMs / 1000).toFixed(1)}s`,
        `mime: ${status.mimeType}`,
        status.origName ? `orig name: ${status.origName}` : null,
        `magic header: "${magic}" (expect "glTF")`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "error":
      return `Error: ${status.message}`;
  }
}
