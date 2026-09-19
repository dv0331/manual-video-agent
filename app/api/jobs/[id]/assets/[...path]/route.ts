import { jobDir } from "@/lib/agent/paths";
import { safeJoin, serveLocalFile } from "@/lib/agent/serve-file";

export const runtime = "nodejs";

function resolvePath(id: string, segments: string[]) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return safeJoin(jobDir(id), segments);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path: segments } = await context.params;
  return serveLocalFile(request, resolvePath(id, segments), true);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path: segments } = await context.params;
  return serveLocalFile(request, resolvePath(id, segments));
}
