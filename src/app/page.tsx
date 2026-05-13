"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { compileScadToStl, downloadStl } from "@/lib/openscad";
import type { SketchPadHandle } from "@/components/SketchPad";
import type { MeshDimensions } from "@/components/MeshViewer";
import PhaseStepper from "@/components/PhaseStepper";

const PhotoCapture = dynamic(() => import("@/components/PhotoCapture"), {
  ssr: false,
  loading: () => (
    <div className="aspect-square w-full rounded border border-zinc-200 bg-zinc-50" />
  ),
});

const MeshViewer = dynamic(() => import("@/components/MeshViewer"), {
  ssr: false,
  loading: () => (
    <div className="h-96 w-full rounded border border-zinc-200 bg-zinc-50" />
  ),
});

const SketchPad = dynamic(() => import("@/components/SketchPad"), {
  ssr: false,
  loading: () => (
    <div className="h-100 w-full rounded border border-zinc-200 bg-zinc-50" />
  ),
});

const StlViewer = dynamic(() => import("@/components/StlViewer"), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full rounded border border-zinc-200 bg-zinc-50" />
  ),
});

const MAX_REPAIR_ATTEMPTS = 2;

type AppPhase =
  | { kind: "intro" }
  | { kind: "capture" }
  | { kind: "processing" } // photo → /api/generate-mesh
  | { kind: "calibrate"; glb: Uint8Array }
  | { kind: "describe" }
  | { kind: "generating" }
  | { kind: "compiling"; attempt: number; scad: string }
  | { kind: "repairing"; attempt: number; lastError: string }
  | { kind: "ready"; scad: string; stl: Uint8Array; repaired: boolean }
  | { kind: "error"; message: string; scad?: string };

interface FormState {
  width: string;
  height: string;
  depth: string;
  description: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  width: "",
  height: "",
  depth: "",
  description: "",
  notes: "",
};

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>({ kind: "intro" });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [calibrated, setCalibrated] = useState<MeshDimensions | null>(null);
  const [scannedPath, setScannedPath] = useState(false); // true if user took the capture route
  const [scadOpen, setScadOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const sketchRef = useRef<SketchPadHandle | null>(null);

  function reset() {
    setPhase({ kind: "intro" });
    setForm(EMPTY_FORM);
    setCalibrated(null);
    setScannedPath(false);
    setScadOpen(false);
  }

  function startScanFlow() {
    setScannedPath(true);
    setPhase({ kind: "capture" });
  }

  function skipScanFlow() {
    setScannedPath(false);
    setPhase({ kind: "describe" });
  }

  async function handlePhotosCaptured(photos: Blob[]) {
    if (photos.length === 0) return;
    setPhase({ kind: "processing" });
    try {
      const formData = new FormData();
      formData.append("photo", photos[0], "front.jpg");
      const res = await fetch("/api/generate-mesh", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `mesh generation returned ${res.status}`);
      }
      const buffer = await res.arrayBuffer();
      setPhase({ kind: "calibrate", glb: new Uint8Array(buffer) });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleCalibrated(dims: MeshDimensions) {
    setCalibrated(dims);
    setForm((prev) => ({
      ...prev,
      width: dims.width.toFixed(1),
      height: dims.height.toFixed(1),
      depth: dims.depth.toFixed(1),
    }));
    setPhase({ kind: "describe" });
  }

  async function handleGenerate() {
    const width = Number(form.width);
    const height = Number(form.height);
    const depth = Number(form.depth);
    if (![width, height, depth].every((n) => Number.isFinite(n) && n > 0)) {
      setPhase({
        kind: "error",
        message: "Enter positive numeric dimensions for W, H, D.",
      });
      return;
    }
    if (!form.description.trim()) {
      setPhase({
        kind: "error",
        message: "Describe what you want to make.",
      });
      return;
    }

    setPhase({ kind: "generating" });
    setScadOpen(false);
    try {
      const sketch = (await sketchRef.current?.exportPng()) ?? undefined;
      const res = await fetch("/api/generate-scad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description.trim(),
          width,
          height,
          depth,
          notes: form.notes.trim() || undefined,
          sketch,
        }),
      });
      const data = (await res.json()) as { scad?: string; error?: string };
      if (!res.ok || !data.scad) {
        throw new Error(data.error || `generate-scad returned ${res.status}`);
      }
      await compileWithRepair(data.scad, 0);
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function compileWithRepair(scad: string, attempt: number) {
    setPhase({ kind: "compiling", attempt, scad });
    try {
      const { stl } = await compileScadToStl(scad);
      setPhase({ kind: "ready", scad, stl, repaired: attempt > 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt >= MAX_REPAIR_ATTEMPTS) {
        setPhase({
          kind: "error",
          message: `Compile failed after ${attempt} repair attempt(s):\n\n${message}`,
          scad,
        });
        setScadOpen(true);
        return;
      }
      setPhase({ kind: "repairing", attempt: attempt + 1, lastError: message });
      try {
        const res = await fetch("/api/repair-scad", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brokenScad: scad,
            errorMessage: message,
            originalInput: {
              description: form.description.trim(),
              width: Number(form.width),
              height: Number(form.height),
              depth: Number(form.depth),
              notes: form.notes.trim() || undefined,
            },
          }),
        });
        const data = (await res.json()) as { scad?: string; error?: string };
        if (!res.ok || !data.scad) {
          throw new Error(data.error || `repair-scad returned ${res.status}`);
        }
        await compileWithRepair(data.scad, attempt + 1);
      } catch (repairErr) {
        setPhase({
          kind: "error",
          message:
            repairErr instanceof Error
              ? repairErr.message
              : String(repairErr),
          scad,
        });
        setScadOpen(true);
      }
    }
  }

  function handleDownload() {
    if (phase.kind !== "ready") return;
    const slug =
      form.description
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "printbuddy";
    downloadStl(phase.stl, `${slug}.stl`);
  }

  async function copyScad() {
    const scad = currentScad(phase);
    if (!scad) return;
    try {
      await navigator.clipboard.writeText(scad);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const stepIndex = stepIndexFor(phase, scannedPath);
  const doneCount = doneCountFor(phase, scannedPath);
  const busy = isBusy(phase);
  const scad = currentScad(phase);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">PrintBuddy</h1>
        <p className="text-sm text-zinc-500">
          Scan, sketch, describe — get a printable STL.
        </p>
      </header>

      {phase.kind !== "intro" && (
        <PhaseStepper active={stepIndex} done={doneCount} />
      )}

      {phase.kind === "intro" && (
        <section className="flex flex-col gap-3 rounded border border-zinc-200 p-4">
          <p className="text-sm text-zinc-700">
            Capture a reference object, calibrate the scale, sketch what you
            want, and PrintBuddy will generate a printable STL.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startScanFlow}
              className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Start scanning
            </button>
            <button
              type="button"
              onClick={skipScanFlow}
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium"
            >
              Skip scanning (text only)
            </button>
          </div>
        </section>
      )}

      {phase.kind === "capture" && (
        <PhotoCapture onComplete={handlePhotosCaptured} />
      )}

      {phase.kind === "processing" && (
        <StatusCard
          title="Reconstructing your object…"
          body="Sending the front-facing photo to Hunyuan3D-2. First call can queue for a minute or two on free-tier GPU."
        />
      )}

      {phase.kind === "calibrate" && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-zinc-700">
            Click two known reference points on the mesh, then enter the
            real-world distance. The bounding box rescales accordingly.
          </p>
          <MeshViewer glb={phase.glb} onCalibrated={handleCalibrated} />
        </section>
      )}

      {phase.kind === "describe" && (
        <DescribePanel
          form={form}
          setForm={setForm}
          sketchRef={sketchRef}
          calibrated={calibrated}
          onGenerate={handleGenerate}
          busy={busy}
        />
      )}

      {(phase.kind === "generating" ||
        phase.kind === "compiling" ||
        phase.kind === "repairing") && (
        <StatusCard
          title={statusTitle(phase)}
          body={statusBody(phase)}
        />
      )}

      {scad && phase.kind !== "describe" && (
        <ScadBlock
          scad={scad}
          open={scadOpen}
          onToggle={() => setScadOpen((o) => !o)}
          onCopy={copyScad}
          copied={copied}
        />
      )}

      {phase.kind === "ready" && (
        <section className="flex flex-col gap-3">
          {phase.repaired && (
            <p className="text-xs text-amber-700">
              Generated SCAD failed on first compile — auto-repair recovered it.
            </p>
          )}
          <StlViewer stl={phase.stl} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Download STL
            </button>
            <button
              type="button"
              onClick={() => setPhase({ kind: "describe" })}
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium"
            >
              Start over
            </button>
          </div>
        </section>
      )}

      {phase.kind === "error" && (
        <section className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Something went wrong</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{phase.message}</pre>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() =>
                setPhase({
                  kind: scannedPath && !calibrated ? "capture" : "describe",
                })
              }
              className="rounded bg-black px-3 py-1 text-xs font-medium text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded border border-zinc-400 px-3 py-1 text-xs font-medium"
            >
              Start over
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function DescribePanel({
  form,
  setForm,
  sketchRef,
  calibrated,
  onGenerate,
  busy,
}: {
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  sketchRef: React.RefObject<SketchPadHandle | null>;
  calibrated: MeshDimensions | null;
  onGenerate: () => void;
  busy: boolean;
}) {
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  return (
    <section className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between">
          <label className="text-sm font-medium text-zinc-700">
            Reference object dimensions (mm)
          </label>
          {calibrated && (
            <span className="text-[11px] text-emerald-700">
              auto-filled from scan
            </span>
          )}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-2">
          <NumberInput
            label="W"
            value={form.width}
            onChange={(v) => update("width", v)}
            disabled={busy}
          />
          <NumberInput
            label="H"
            value={form.height}
            onChange={(v) => update("height", v)}
            disabled={busy}
          />
          <NumberInput
            label="D"
            value={form.depth}
            onChange={(v) => update("depth", v)}
            disabled={busy}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="description"
          className="text-sm font-medium text-zinc-700"
        >
          What do you want to make?
        </label>
        <textarea
          id="description"
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          disabled={busy}
          className="mt-1 h-24 w-full rounded border border-zinc-300 p-2 text-sm disabled:bg-zinc-100"
        />
      </div>

      <SketchPad ref={sketchRef} disabled={busy} />

      <div>
        <label htmlFor="notes" className="text-sm font-medium text-zinc-700">
          Additional notes (optional)
        </label>
        <input
          id="notes"
          type="text"
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          disabled={busy}
          className="mt-1 w-full rounded border border-zinc-300 p-2 text-sm disabled:bg-zinc-100"
        />
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className="self-start rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Generate STL
      </button>
    </section>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center rounded border border-zinc-300 px-2 text-sm focus-within:border-black has-disabled:bg-zinc-100">
      <span className="mr-2 text-zinc-500">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-transparent py-2 outline-none"
      />
    </label>
  );
}

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <p className="font-medium text-zinc-800">{title}</p>
      <p className="mt-1 text-xs text-zinc-600">{body}</p>
    </div>
  );
}

function ScadBlock({
  scad,
  open,
  onToggle,
  onCopy,
  copied,
}: {
  scad: string;
  open: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm font-medium"
      >
        <span>Generated OpenSCAD ({scad.split("\n").length} lines)</span>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <pre className="max-h-80 overflow-auto rounded border border-zinc-200 bg-zinc-900 p-3 font-mono text-xs text-zinc-100">
            {scad}
          </pre>
          <button
            type="button"
            onClick={onCopy}
            className="self-start rounded border border-zinc-300 px-3 py-1 text-xs"
          >
            {copied ? "Copied!" : "Copy SCAD"}
          </button>
        </div>
      )}
    </section>
  );
}

function statusTitle(phase: AppPhase): string {
  switch (phase.kind) {
    case "generating":
      return "Designing your part with Gemini…";
    case "compiling":
      return phase.attempt === 0
        ? "Compiling SCAD → STL…"
        : `Compiling repaired SCAD (attempt ${phase.attempt + 1}/${MAX_REPAIR_ATTEMPTS + 1})…`;
    case "repairing":
      return `Auto-repair (attempt ${phase.attempt}/${MAX_REPAIR_ATTEMPTS})…`;
    default:
      return "";
  }
}

function statusBody(phase: AppPhase): string {
  switch (phase.kind) {
    case "generating":
      return "Vision model is interpreting the sketch + description.";
    case "compiling":
      return "openscad-wasm is running in your browser. First run loads ~14 MB of WASM.";
    case "repairing":
      return "Last compile failed — feeding the error back to Gemini for a fix.";
    default:
      return "";
  }
}

function isBusy(phase: AppPhase): boolean {
  switch (phase.kind) {
    case "processing":
    case "generating":
    case "compiling":
    case "repairing":
      return true;
    default:
      return false;
  }
}

function currentScad(phase: AppPhase): string {
  switch (phase.kind) {
    case "compiling":
    case "ready":
    case "error":
      return phase.scad ?? "";
    default:
      return "";
  }
}

function stepIndexFor(
  phase: AppPhase,
  scannedPath: boolean,
): 0 | 1 | 2 | 3 | -1 {
  switch (phase.kind) {
    case "capture":
    case "processing":
      return 0;
    case "calibrate":
      return 1;
    case "describe":
    case "generating":
      return 2;
    case "compiling":
    case "repairing":
    case "ready":
      return 3;
    case "error":
      return scannedPath ? 2 : 2;
    default:
      return -1;
  }
}

function doneCountFor(phase: AppPhase, scannedPath: boolean): number {
  switch (phase.kind) {
    case "capture":
      return 0;
    case "processing":
      return 0;
    case "calibrate":
      return 1;
    case "describe":
      return scannedPath ? 2 : 0;
    case "generating":
      return scannedPath ? 2 : 0;
    case "compiling":
    case "repairing":
      return scannedPath ? 3 : 1;
    case "ready":
      return 4;
    default:
      return 0;
  }
}
