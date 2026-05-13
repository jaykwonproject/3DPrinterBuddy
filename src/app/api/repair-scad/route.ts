import { NextResponse } from "next/server";
import { repairScad } from "@/lib/gemini";
import type { ErrorResponse, ScadResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ParsedRepair {
  brokenScad: string;
  errorMessage: string;
  description: string;
  width: number;
  height: number;
  depth: number;
  notes?: string;
}

function validate(body: unknown): ParsedRepair | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const b = body as Record<string, unknown>;

  const brokenScad =
    typeof b.brokenScad === "string" ? b.brokenScad.trim() : "";
  if (!brokenScad) return "brokenScad is required";

  const errorMessage =
    typeof b.errorMessage === "string" ? b.errorMessage.trim() : "";
  if (!errorMessage) return "errorMessage is required";

  const orig = b.originalInput;
  if (!orig || typeof orig !== "object") {
    return "originalInput is required";
  }
  const o = orig as Record<string, unknown>;
  const description =
    typeof o.description === "string" ? o.description.trim() : "";
  if (!description) return "originalInput.description is required";

  const width = Number(o.width);
  const height = Number(o.height);
  const depth = Number(o.depth);
  if (![width, height, depth].every((n) => Number.isFinite(n) && n > 0)) {
    return "originalInput.width/height/depth must be positive numbers";
  }
  const notes = typeof o.notes === "string" ? o.notes : undefined;

  return { brokenScad, errorMessage, description, width, height, depth, notes };
}

export async function POST(
  request: Request,
): Promise<NextResponse<ScadResponse | ErrorResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validate(body);
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  try {
    const scad = await repairScad({
      brokenScad: parsed.brokenScad,
      errorMessage: parsed.errorMessage,
      originalInput: {
        description: parsed.description,
        width: parsed.width,
        height: parsed.height,
        depth: parsed.depth,
        notes: parsed.notes,
      },
    });
    if (!scad) {
      return NextResponse.json(
        { error: "Empty response from model" },
        { status: 502 },
      );
    }
    return NextResponse.json({ scad });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown repair error";
    console.error("[repair-scad]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
