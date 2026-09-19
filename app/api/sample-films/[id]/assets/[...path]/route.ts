import { NextResponse } from "next/server";
import { safeJoin, serveLocalFile } from "@/lib/agent/serve-file";
import { sampleFilmDir, sampleFilmReady } from "@/lib/sample-manual/films";

export const runtime = "nodejs";

function resolveAsset(id: string, segments: string[]) {
  if (!/^[a-z0-9-]+$/i.test(id) || !sampleFilmReady(id)) return null;
  return safeJoin(sampleFilmDir(id), segments);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path: segments } = await context.params;
  return serveLocalFile(request, resolveAsset(id, segments), true);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path: segments } = await context.params;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return NextResponse.json({ error: "Unknown sample" }, { status: 400 });
  }
  return serveLocalFile(request, resolveAsset(id, segments));
}
