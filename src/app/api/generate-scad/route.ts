import { NextResponse } from "next/server";
import { generateScad } from "@/lib/gemini";
import type {
  ErrorResponse,
  GenerateScadRequest,
  ScadResponse,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseSketch(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const comma = raw.indexOf(",");
  if (raw.startsWith("data:") && comma !== -1) {
    return raw.slice(comma + 1);
  }
  return raw;
}

function validate(body: unknown): GenerateScadRequest | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const b = body as Record<string, unknown>;

  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!description) return "description is required";

  const width = Number(b.width);
  const height = Number(b.height);
  const depth = Number(b.depth);
  if (![width, height, depth].every((n) => Number.isFinite(n) && n > 0)) {
    return "width, height, depth must be positive numbers";
  }

  const notes = typeof b.notes === "string" ? b.notes : undefined;
  const sketch = parseSketch(b.sketch);

  return { description, width, height, depth, notes, sketch };
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
    const scad = await generateScad({
      description: parsed.description,
      width: parsed.width,
      height: parsed.height,
      depth: parsed.depth,
      notes: parsed.notes,
      sketchBase64: parsed.sketch,
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
      err instanceof Error ? err.message : "Unknown generation error";
    console.error("[generate-scad]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
