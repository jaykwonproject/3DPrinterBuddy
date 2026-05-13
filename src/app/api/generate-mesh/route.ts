import { NextResponse } from "next/server";
import { generateMesh } from "@/lib/huggingface";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const photo = form.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) {
    return NextResponse.json(
      { error: "photo field is required (front-facing image)" },
      { status: 400 },
    );
  }

  try {
    const mesh = await generateMesh(photo);
    return new Response(new Uint8Array(mesh.glb), {
      status: 200,
      headers: {
        "Content-Type": mesh.mimeType,
        "Content-Length": String(mesh.glb.byteLength),
        "Content-Disposition": `attachment; filename="${mesh.origName ?? "mesh.glb"}"`,
        ...(mesh.seed !== undefined && { "X-Mesh-Seed": String(mesh.seed) }),
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown mesh generation error";
    console.error("[generate-mesh]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
