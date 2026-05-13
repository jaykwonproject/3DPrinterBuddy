import { Client, handle_file } from "@gradio/client";

// Hunyuan3D-2 Gradio Space endpoint: /shape_generation
// Params discovered via https://tencent-hunyuan3d-2.hf.space/info on 2026-05-12.
const ENDPOINT = "/shape_generation";
const DEFAULT_SPACE_URL = "https://tencent-hunyuan3d-2.hf.space";

interface ShapeGenerationFile {
  url?: string;
  path?: string;
  orig_name?: string;
}

// Some Gradio versions wrap component outputs as `{ value: FileData, __type__ }`.
function unwrapFile(entry: unknown): ShapeGenerationFile | null {
  if (!entry || typeof entry !== "object") return null;
  const obj = entry as Record<string, unknown>;
  if (typeof obj.url === "string") return obj as ShapeGenerationFile;
  if (obj.value && typeof obj.value === "object") {
    return unwrapFile(obj.value);
  }
  return null;
}

export interface GeneratedMesh {
  glb: Uint8Array;
  mimeType: string;
  origName?: string;
  stats?: unknown;
  seed?: number;
}

let clientPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    const url = process.env.HF_SPACE_URL?.trim() || DEFAULT_SPACE_URL;
    const token = process.env.HF_TOKEN?.trim();
    clientPromise = Client.connect(url, {
      token: token ? (token as `hf_${string}`) : undefined,
    }).catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export async function generateMesh(photo: Blob): Promise<GeneratedMesh> {
  const client = await getClient();
  const params: Record<string, unknown> = {
    caption: "",
    image: handle_file(photo),
    mv_image_front: null,
    mv_image_back: null,
    mv_image_left: null,
    mv_image_right: null,
    steps: 30,
    guidance_scale: 5.0,
    seed: 1234,
    octree_resolution: 256,
    check_box_rembg: true,
    num_chunks: 8000,
    randomize_seed: true,
  };

  const result = await client.predict(ENDPOINT, params);
  const data = result.data as unknown;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("HF Space returned no data");
  }

  console.log("[hf] response shape:", summarizeData(data));

  const file = unwrapFile(data[0]);
  if (!file?.url) {
    const detail = extractErrorDetail(data);
    throw new Error(
      detail
        ? `HF Space returned no mesh file URL — ${detail}`
        : `HF Space returned no mesh file URL (raw: ${JSON.stringify(summarizeData(data)).slice(0, 400)})`,
    );
  }

  const fetched = await fetch(file.url);
  if (!fetched.ok) {
    throw new Error(`Failed to fetch GLB from ${file.url}: ${fetched.status}`);
  }
  const buffer = await fetched.arrayBuffer();
  const mimeType = fetched.headers.get("content-type") || "model/gltf-binary";

  return {
    glb: new Uint8Array(buffer),
    mimeType,
    origName: file.orig_name,
    stats: data[2],
    seed: typeof data[3] === "number" ? data[3] : undefined,
  };
}

function summarizeData(data: unknown[]): unknown {
  return data.map((entry, i) => {
    if (entry === null || entry === undefined) return `[${i}]: ${entry}`;
    if (typeof entry === "object") {
      const keys = Object.keys(entry as object);
      return `[${i}]: {${keys.join(", ")}}`;
    }
    const s = String(entry);
    return `[${i}]: ${typeof entry} ${s.length > 120 ? s.slice(0, 120) + "…" : s}`;
  });
}

function extractErrorDetail(data: unknown[]): string | null {
  // Output (string/HTML) is usually data[1] — Gradio puts error text here when
  // the function ran but couldn't produce a file.
  const out = data[1];
  if (typeof out === "string" && out.trim()) {
    const stripped = out
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped) return stripped.slice(0, 400);
  }
  if (data[0] === null) {
    return "first output (mesh file) was null";
  }
  return null;
}
