import { findFilmDir } from "@/lib/agent/library";
import { safeJoin, serveLocalFile } from "@/lib/agent/serve-file";

export const runtime = "nodejs";

function resolvePath(id: string, segments: string[]) {
  const dir = findFilmDir(id);
  return dir ? safeJoin(dir, segments) : null;
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: segments } = await context.params;
  return serveLocalFile(request, resolvePath(id, segments), true);
}

export async function GET(request: Request, context: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path: segments } = await context.params;
  return serveLocalFile(request, resolvePath(id, segments));
}
