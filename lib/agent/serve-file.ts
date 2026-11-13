import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".vtt": "text/vtt",
  ".srt": "application/x-subrip",
  ".pdf": "application/pdf",
  ".json": "application/json",
};

type Range = { start: number; end: number } | "unsatisfiable" | null;

function parseRange(header: string | null, size: number): Range {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!suffix) return "unsatisfiable";
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

function fileStream(filePath: string, start: number, end: number) {
  return Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream<Uint8Array>;
}

export function safeJoin(root: string, segments: string[]) {
  const rel = segments.join("/");
  if (!rel || rel.includes("..")) return null;
  const filePath = path.join(root, rel);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (filePath !== root && !filePath.startsWith(prefix)) return null;
  return filePath;
}

function downloadName(request: Request, filePath: string) {
  const params = new URL(request.url).searchParams;
  if (params.get("download") !== "1") return null;
  const name = (params.get("name") || path.basename(filePath)).replace(/[^A-Za-z0-9._-]+/g, "-");
  return name.slice(0, 120) || "download";
}

export async function serveLocalFile(request: Request, filePath: string | null, headOnly = false) {
  if (!filePath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  try {
    const info = await stat(/* turbopackIgnore: true */ filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const ext = path.extname(filePath).toLowerCase();
    const headers: Record<string, string> = {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    };
    const attachment = downloadName(request, filePath);
    if (attachment) headers["Content-Disposition"] = `attachment; filename="${attachment}"`;

    if (headOnly) {
      return new NextResponse(null, { headers: { ...headers, "Content-Length": String(info.size) } });
    }

    const range = parseRange(request.headers.get("range"), info.size);
    if (range === "unsatisfiable") {
      return new NextResponse(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${info.size}` },
      });
    }
    if (range) {
      return new NextResponse(fileStream(filePath, range.start, range.end), {
        status: 206,
        headers: {
          ...headers,
          "Content-Length": String(range.end - range.start + 1),
          "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        },
      });
    }
    if (info.size === 0) {
      return new NextResponse(null, { headers: { ...headers, "Content-Length": "0" } });
    }
    return new NextResponse(fileStream(filePath, 0, info.size - 1), {
      headers: { ...headers, "Content-Length": String(info.size) },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
}
