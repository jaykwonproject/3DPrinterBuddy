"use client";

import { useState } from "react";
import { compileScadToStl, downloadStl } from "@/lib/openscad";

const TEST_SCAD = `$fn = 64;
cube([20, 20, 20], center=true);
translate([0, 0, 15]) sphere(10);
`;

type Status =
  | { kind: "idle" }
  | { kind: "compiling" }
  | { kind: "ready"; bytes: number; elapsedMs: number }
  | { kind: "error"; message: string };

export default function OpenScadTestPage() {
  const [code, setCode] = useState(TEST_SCAD);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [stl, setStl] = useState<Uint8Array | null>(null);

  async function handleCompile() {
    setStatus({ kind: "compiling" });
    setStl(null);
    const t0 = performance.now();
    try {
      const { stl } = await compileScadToStl(code);
      const elapsedMs = Math.round(performance.now() - t0);
      setStl(stl);
      setStatus({ kind: "ready", bytes: stl.byteLength, elapsedMs });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message });
    }
  }

  function handleDownload() {
    if (!stl) return;
    downloadStl(stl, "phase3-test.stl");
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Phase 3 — openscad-wasm test
        </h1>
        <p className="text-sm text-zinc-500">
          Compiles the SCAD below in your browser and downloads the STL. Open
          it in Bambu Studio / PrusaSlicer to verify Phase 3.
        </p>
      </header>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="h-48 w-full rounded border border-zinc-300 p-3 font-mono text-sm"
        spellCheck={false}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCompile}
          disabled={status.kind === "compiling"}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {status.kind === "compiling" ? "Compiling…" : "Compile to STL"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!stl}
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Download STL
        </button>
      </div>

      <pre className="rounded bg-zinc-50 p-3 text-xs text-zinc-700">
        {renderStatus(status)}
      </pre>
    </main>
  );
}

function renderStatus(status: Status): string {
  switch (status.kind) {
    case "idle":
      return "Idle — click Compile to STL.";
    case "compiling":
      return "Compiling (first run downloads ~14 MB of WASM into memory)…";
    case "ready":
      return `STL ready: ${status.bytes.toLocaleString()} bytes · compiled in ${status.elapsedMs} ms`;
    case "error":
      return `Error: ${status.message}`;
  }
}
