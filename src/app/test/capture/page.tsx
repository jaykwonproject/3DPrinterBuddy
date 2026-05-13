"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const PhotoCapture = dynamic(() => import("@/components/PhotoCapture"), {
  ssr: false,
  loading: () => (
    <div className="aspect-square w-full rounded border border-zinc-200 bg-zinc-50" />
  ),
});

interface CapturedSummary {
  index: number;
  bytes: number;
  type: string;
}

export default function CaptureTestPage() {
  const [summary, setSummary] = useState<CapturedSummary[] | null>(null);

  function handleComplete(photos: Blob[]) {
    setSummary(
      photos.map((b, i) => ({
        index: i + 1,
        bytes: b.size,
        type: b.type || "image/jpeg",
      })),
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Phase 5 — photo capture test
        </h1>
        <p className="text-sm text-zinc-500">
          Camera requires HTTPS on iOS; localhost works on desktop Safari/Chrome.
        </p>
      </header>

      <PhotoCapture onComplete={handleComplete} />

      {summary && (
        <section className="rounded border border-zinc-200 bg-zinc-50 p-3 text-xs">
          <p className="font-medium text-zinc-700">Captured {summary.length} photos:</p>
          <ul className="mt-2 space-y-1 font-mono text-zinc-600">
            {summary.map((s) => (
              <li key={s.index}>
                #{s.index} · {(s.bytes / 1024).toFixed(1)} KB · {s.type}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
