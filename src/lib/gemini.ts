import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import {
  SYSTEM_PROMPT,
  buildRepairPrompt,
  buildUserPrompt,
  type ScadGenerationInput,
} from "@/lib/prompts";

const DEFAULT_MODEL = "gemini-2.5-pro";
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 110_000;

function getClient(): { client: GoogleGenerativeAI; modelName: string } {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  return { client: new GoogleGenerativeAI(apiKey), modelName };
}

export function cleanScadOutput(raw: string): string {
  let text = raw.trim();
  const fence = /^```(?:scad|openscad)?\s*\n?([\s\S]*?)\n?```$/i;
  const match = text.match(fence);
  if (match) {
    text = match[1].trim();
  } else {
    text = text.replace(/^```(?:scad|openscad)?\s*\n?/i, "");
    text = text.replace(/\n?```\s*$/i, "");
  }
  return text.trim();
}

async function generate(parts: Array<string | Part>): Promise<string> {
  const { client, modelName } = getClient();
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await model.generateContent(
      { contents: [{ role: "user", parts: parts.map(toPart) }] },
      { signal: controller.signal },
    );
    return cleanScadOutput(result.response.text());
  } finally {
    clearTimeout(timeout);
  }
}

function toPart(p: string | Part): Part {
  return typeof p === "string" ? { text: p } : p;
}

export async function generateScad(input: ScadGenerationInput): Promise<string> {
  const parts: Array<string | Part> = [buildUserPrompt(input)];
  if (input.sketchBase64) {
    parts.push({
      inlineData: { mimeType: "image/png", data: input.sketchBase64 },
    });
  }
  return generate(parts);
}

export async function repairScad(args: {
  brokenScad: string;
  errorMessage: string;
  originalInput: ScadGenerationInput;
}): Promise<string> {
  const prompt = buildRepairPrompt(
    args.brokenScad,
    args.errorMessage,
    args.originalInput,
  );
  return generate([prompt]);
}
