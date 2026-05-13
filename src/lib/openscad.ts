// Client-only OpenSCAD compiler. The `openscad-wasm` package inlines the
// WebAssembly binary as base64 inside `openscad.js` (~14 MB), so we lazy-load
// it on first use to keep the initial bundle small.

import type { OpenSCAD, OpenSCADInstance } from "openscad-wasm";

interface Compiler {
  instance: OpenSCADInstance;
  module: OpenSCAD;
  // Per-call buffers swapped in/out around each compile.
  stdoutBuffer: string[];
  stderrBuffer: string[];
}

let compilerPromise: Promise<Compiler> | null = null;

async function getCompiler(): Promise<Compiler> {
  if (typeof window === "undefined") {
    throw new Error("openscad-wasm only runs in the browser");
  }
  if (!compilerPromise) {
    compilerPromise = (async () => {
      const { createOpenSCAD } = await import("openscad-wasm");
      const stdoutBuffer: string[] = [];
      const stderrBuffer: string[] = [];
      const instance = await createOpenSCAD({
        print: (text) => stdoutBuffer.push(text),
        printErr: (text) => stderrBuffer.push(text),
      });
      return {
        instance,
        module: instance.getInstance(),
        stdoutBuffer,
        stderrBuffer,
      };
    })().catch((err) => {
      compilerPromise = null;
      throw err;
    });
  }
  return compilerPromise;
}

export interface CompileResult {
  stl: Uint8Array;
  stdout: string;
  stderr: string;
}

export async function compileScadToStl(code: string): Promise<CompileResult> {
  const compiler = await getCompiler();
  const { module, stdoutBuffer, stderrBuffer } = compiler;
  const { FS } = module;

  stdoutBuffer.length = 0;
  stderrBuffer.length = 0;

  FS.writeFile("/input.scad", code);
  let exitCode = 0;
  let trapMessage: string | null = null;
  try {
    exitCode = module.callMain(["/input.scad", "-o", "/output.stl"]);
  } catch (err) {
    // OpenSCAD exits the runtime via an exception in some builds. ExitStatus is
    // routine; anything else is a wasm trap (OOM, CGAL assertion, etc.) where
    // the message is usually an opaque pointer.
    const message = err instanceof Error ? err.message : String(err);
    if (!/^ExitStatus|Exit/i.test(message)) {
      trapMessage = message;
    }
  } finally {
    try {
      FS.unlink("/input.scad");
    } catch {
      // ignore
    }
  }

  let stl: Uint8Array;
  try {
    stl = new TextEncoder().encode(
      FS.readFile("/output.stl", { encoding: "utf8" }),
    );
  } catch {
    throw new Error(
      buildErrorMessage(
        translateCompileFailure(trapMessage, exitCode, stderrBuffer),
        stderrBuffer,
      ),
    );
  } finally {
    try {
      FS.unlink("/output.stl");
    } catch {
      // ignore
    }
  }

  if (stl.byteLength === 0) {
    throw new Error(
      buildErrorMessage(
        "OpenSCAD produced an empty STL (non-manifold or empty geometry).",
        stderrBuffer,
      ),
    );
  }

  return {
    stl,
    stdout: stdoutBuffer.join("\n"),
    stderr: stderrBuffer.join("\n"),
  };
}

function buildErrorMessage(headline: string, stderrBuffer: string[]): string {
  const stderr = stderrBuffer.join("\n").trim();
  return stderr ? `${headline}\n${stderr}` : headline;
}

function translateCompileFailure(
  trapMessage: string | null,
  exitCode: number,
  stderrBuffer: string[],
): string {
  const stderr = stderrBuffer.join("\n");
  // OpenSCAD's structured parser/eval errors land in stderr and are useful to
  // pass straight back into the repair flow.
  if (/^(ERROR|WARNING):/m.test(stderr)) {
    return `OpenSCAD reported errors (exit ${exitCode}).`;
  }
  // No structured error but the wasm runtime trapped — almost always a CGAL
  // assertion (degenerate manifold) or out-of-memory in the in-browser kernel.
  if (trapMessage || exitCode !== 0) {
    return "Geometry is too complex or non-manifold for the in-browser compiler. Typical causes: hull() over many primitives, minkowski(), or difference() with cuts that share faces. Try simpler primitives or describe a less detailed part.";
  }
  return `OpenSCAD produced no output (exit ${exitCode}).`;
}

export function downloadStl(data: Uint8Array, filename: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([new Uint8Array(data)], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".stl") ? filename : `${filename}.stl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
