import { open, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jobDir } from "@/lib/agent/paths";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".vtt": "text/vtt",
  ".pdf": "application/pdf",
  ".json": "application/json",
};

function resolvePath(id: string, segments: string[]) {
  const rel = segments.join("/");
  if (rel.includes("..")) return null;
  const filePath = path.join(jobDir(id), rel);
  if (!filePath.startsWith(jobDir(id))) return null;
  return filePath;
}

function parseRange(header: string | null, size: number) {
  if (!header) return null;
  const match = header.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

async function readSlice(filePath: string, start: number, length: number) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer;
  } finally {
    await handle.close();
  }
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path: segments } = await context.params;
  const filePath = resolvePath(id, segments);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  try {
    const info = await stat(/* turbopackIgnore: true */ filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(null, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path: segments } = await context.params;
  const filePath = resolvePath(id, segments);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  try {
    const info = await stat(/* turbopackIgnore: true */ filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    const range = parseRange(request.headers.get("range"), info.size);

    if (range) {
      const length = range.end - range.start + 1;
      const data = await readSlice(filePath, range.start, length);
      return new NextResponse(new Uint8Array(data), {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Length": String(length),
          "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const data = await readSlice(filePath, 0, info.size);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
}
