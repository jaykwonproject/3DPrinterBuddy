"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TOTAL_PHOTOS = 8;
const MAX_LONGEST_SIDE = 1024;
const JPEG_QUALITY = 0.85;

// Clock positions: 12, 1:30, 3, 4:30, 6, 7:30, 9, 10:30 (every 45°, starting top).
const POSITION_HINTS = [
  "Front (12 o'clock)",
  "Front-right (1:30)",
  "Right (3 o'clock)",
  "Back-right (4:30)",
  "Back (6 o'clock)",
  "Back-left (7:30)",
  "Left (9 o'clock)",
  "Front-left (10:30)",
];

interface CapturedPhoto {
  blob: Blob;
  url: string; // object URL for thumbnail; revoked on reset
  bytes: number;
}

export interface PhotoCaptureProps {
  onComplete: (photos: Blob[]) => void;
}

type Mode =
  | { kind: "idle" }
  | { kind: "streaming"; index: number }
  | { kind: "reviewing"; index: number; pending: CapturedPhoto }
  | { kind: "done" };

export default function PhotoCapture({ onComplete }: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startStream = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Camera unavailable: ${message}`);
      setMode({ kind: "idle" });
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      // Revoke thumbnails on unmount.
      photos.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    setMode({ kind: "streaming", index: 0 });
    await startStream();
  }

  async function handleCapture() {
    if (mode.kind !== "streaming") return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const blob = await snapshot(video);
    if (!blob) {
      setError("Capture failed");
      return;
    }
    const url = URL.createObjectURL(blob);
    setMode({
      kind: "reviewing",
      index: mode.index,
      pending: { blob, url, bytes: blob.size },
    });
  }

  function handleConfirm() {
    if (mode.kind !== "reviewing") return;
    const next = [...photos, mode.pending];
    setPhotos(next);
    const nextIndex = mode.index + 1;
    if (nextIndex >= TOTAL_PHOTOS) {
      stopStream();
      setMode({ kind: "done" });
    } else {
      setMode({ kind: "streaming", index: nextIndex });
    }
  }

  function handleRetake() {
    if (mode.kind !== "reviewing") return;
    URL.revokeObjectURL(mode.pending.url);
    setMode({ kind: "streaming", index: mode.index });
  }

  function handleRestart() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    stopStream();
    setMode({ kind: "idle" });
  }

  function handleUse() {
    if (mode.kind !== "done" || photos.length !== TOTAL_PHOTOS) return;
    onComplete(photos.map((p) => p.blob));
  }

  const currentIndex =
    mode.kind === "streaming" || mode.kind === "reviewing" ? mode.index : -1;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">
          Capture {TOTAL_PHOTOS} photos around the object
        </h2>
        <span className="text-sm text-zinc-500">
          {photos.length}/{TOTAL_PHOTOS}
        </span>
      </header>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {mode.kind === "idle" && (
        <button
          type="button"
          onClick={handleStart}
          className="min-h-11 self-start rounded-lg bg-zinc-900 hover:bg-zinc-800 px-5 py-2.5 text-sm font-medium text-white"
        >
          Start camera
        </button>
      )}

      {(mode.kind === "streaming" || mode.kind === "reviewing") && (
        <div className="flex flex-col gap-3">
          <div className="relative overflow-hidden rounded-lg border border-zinc-300 bg-black">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={
                mode.kind === "reviewing"
                  ? "hidden"
                  : "block aspect-square w-full object-cover"
              }
            />
            {mode.kind === "reviewing" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mode.pending.url}
                alt={`Photo ${mode.index + 1} preview`}
                className="block aspect-square w-full object-cover"
              />
            )}
            <PositionOverlay current={currentIndex} captured={photos.length} />
          </div>

          <p className="text-sm text-zinc-700">
            {mode.kind === "streaming"
              ? `Position ${currentIndex + 1}/${TOTAL_PHOTOS}: ${POSITION_HINTS[currentIndex]}`
              : `Review photo ${currentIndex + 1}/${TOTAL_PHOTOS} · ${formatBytes(
                  mode.pending.bytes,
                )}`}
          </p>

          {mode.kind === "streaming" ? (
            <button
              type="button"
              onClick={handleCapture}
              className="min-h-11 self-stretch rounded-lg bg-zinc-900 hover:bg-zinc-800 px-5 py-2.5 text-sm font-medium text-white sm:self-start"
            >
              Capture
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                className="min-h-11 flex-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 px-5 py-2.5 text-sm font-medium text-white sm:flex-none"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={handleRetake}
                className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 px-5 py-2.5 text-sm font-medium sm:flex-none"
              >
                Retake
              </button>
            </div>
          )}
        </div>
      )}

      {photos.length > 0 && <ThumbnailStrip photos={photos} />}

      {mode.kind === "done" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={p.url}
                alt={`Photo ${i + 1}`}
                className="aspect-square w-full rounded border border-zinc-200 object-cover"
              />
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleUse}
              className="min-h-11 flex-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 px-5 py-2.5 text-sm font-medium text-white sm:flex-none"
            >
              Use these photos
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 px-5 py-2.5 text-sm font-medium sm:flex-none"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PositionOverlay({
  current,
  captured,
}: {
  current: number;
  captured: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {POSITION_HINTS.map((_, i) => {
        const angle = (i * 360) / TOTAL_PHOTOS - 90; // 0° = 12 o'clock
        const rad = (angle * Math.PI) / 180;
        const r = 44; // percent radius
        const x = 50 + r * Math.cos(rad);
        const y = 50 + r * Math.sin(rad);
        const state =
          i < captured
            ? "bg-emerald-500"
            : i === current
              ? "bg-yellow-400 ring-2 ring-yellow-200"
              : "bg-zinc-50/40 border border-white/60";
        return (
          <span
            key={i}
            className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${state}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        );
      })}
    </div>
  );
}

function ThumbnailStrip({ photos }: { photos: CapturedPhoto[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {photos.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={p.url}
          alt={`Photo ${i + 1}`}
          className="h-16 w-16 flex-none rounded border border-zinc-200 object-cover"
        />
      ))}
    </div>
  );
}

async function snapshot(video: HTMLVideoElement): Promise<Blob | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const longest = Math.max(vw, vh);
  const scale = longest > MAX_LONGEST_SIDE ? MAX_LONGEST_SIDE / longest : 1;
  const cw = Math.round(vw * scale);
  const ch = Math.round(vh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, cw, ch);
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
