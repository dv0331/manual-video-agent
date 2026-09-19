import { open, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

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

export function safeJoin(root: string, segments: string[]) {
  const rel = segments.join("/");
  if (!rel || rel.includes("..")) return null;
  const filePath = path.join(root, rel);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (filePath !== root && !filePath.startsWith(prefix)) return null;
  return filePath;
}

export async function serveLocalFile(
  request: Request,
  filePath: string | null,
  headOnly = false,
) {
  if (!filePath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  try {
    const info = await stat(/* turbopackIgnore: true */ filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    if (headOnly) {
      return new NextResponse(null, {
        headers: {
          "Content-Type": type,
          "Content-Length": String(info.size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

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
