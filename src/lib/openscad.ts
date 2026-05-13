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
  try {
    exitCode = module.callMain(["/input.scad", "-o", "/output.stl"]);
  } catch (err) {
    // OpenSCAD exits the runtime via an exception in some builds.
    const message = err instanceof Error ? err.message : String(err);
    if (!/^ExitStatus|Exit/i.test(message)) {
      throw new Error(buildErrorMessage(message, stderrBuffer));
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
        `OpenSCAD produced no output (exit ${exitCode})`,
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
        "OpenSCAD produced an empty STL (non-manifold or empty geometry)",
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
