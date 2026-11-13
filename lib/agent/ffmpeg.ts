import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { stepLabel } from "@/lib/agent/storyboard";
import type { CameraMotion, Scene } from "@/lib/agent/types";
import { SCENE_SECONDS } from "@/lib/agent/types";

export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720;
export const VIDEO_FPS = Number(process.env.VIDEO_FPS ?? 25);
const VIDEO_CRF = String(process.env.VIDEO_CRF ?? 21);
/** A held picture is coded once, so it can afford far more bits than a moving frame. */
const STILL_CRF = String(process.env.VIDEO_STILL_CRF ?? 16);
/** Seconds of quiet before and after each spoken line. */
export const LEAD_SECONDS = 0.5;
export const TAIL_SECONDS = 0.8;

export function mediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const value = Number.parseFloat(out.trim());
      if (code === 0 && Number.isFinite(value)) resolve(value);
      else reject(new Error(`Could not read duration for ${filePath}`));
    });
  });
}

export function runFfmpeg(args: string[], timeoutMs = 240_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-y", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-1200) || `ffmpeg exited ${code}`));
    });
  });
}

/** Tightest cgroup v2 CPU quota on this process's cgroup or any parent. */
function cgroupCpuLimit() {
  let rel = "/";
  try {
    const line = readFileSync("/proc/self/cgroup", "utf8")
      .split("\n")
      .find((entry) => entry.startsWith("0::"));
    if (line) rel = line.slice(3).trim() || "/";
  } catch {
    // Not Linux, or no cgroup v2.
  }
  let tightest = Infinity;
  for (;;) {
    try {
      const [quota, period] = readFileSync(path.posix.join("/sys/fs/cgroup", rel, "cpu.max"), "utf8")
        .trim()
        .split(/\s+/);
      const limit = Number(quota) / Number(period);
      if (quota !== "max" && Number.isFinite(limit) && limit > 0) tightest = Math.min(tightest, limit);
    } catch {
      // No cpu.max at this level.
    }
    if (rel === "/") break;
    rel = path.posix.dirname(rel);
  }
  return tightest;
}

let cachedBudget: number | undefined;

/**
 * CPUs this process may actually use. Render and Docker cap CPU with cgroups,
 * which `os.availableParallelism()` does not see.
 */
export function cpuBudget() {
  cachedBudget ??= Math.min(os.availableParallelism(), cgroupCpuLimit());
  return cachedBudget;
}

if (cpuBudget() < 1) sharp.concurrency(1);
const memoryLimit = process.constrainedMemory();
// libvips keeps up to 50 MB of decoded images for reuse, which a 512 MB instance cannot spare.
if (memoryLimit > 0 && memoryLimit < 1024 ** 3) sharp.cache(false);

export type MotionMode = "kenburns" | "still";

/**
 * Eased camera motion costs about 1.25 CPU-seconds per second of film; below
 * four CPUs it would outlast the photos by minutes, so smaller hosts hold
 * each scene's picture instead.
 */
export function motionMode(): MotionMode {
  const forced = process.env.VIDEO_MOTION;
  if (forced === "still" || forced === "kenburns") return forced;
  return cpuBudget() < 4 ? "still" : "kenburns";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Rough DejaVu Sans advance width; enough to size chips and wrap lines. */
function textWidth(text: string, size: number, bold = false, letterSpacing = 0) {
  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += 0.32;
    else if (/[A-Z]/.test(ch)) em += 0.72;
    else if (/[0-9]/.test(ch)) em += 0.64;
    else if (/[a-z]/.test(ch)) em += /[ilj]/.test(ch) ? 0.28 : /[mw]/.test(ch) ? 0.9 : 0.6;
    else em += 0.45;
  }
  return em * size * (bold ? 1.08 : 1) + letterSpacing * text.length;
}

function wrap(text: string, size: number, maxWidth: number, maxLines: number, bold = false) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s,.;:]+$/, "")}…`;
    return kept;
  }
  return lines;
}

export function sceneBadge(scene: Pick<Scene, "steps" | "index">, kind: "assembly" | "guide") {
  const steps = [...(scene.steps ?? [])].sort((a, b) => a - b);
  if (!steps.length) {
    if (kind === "guide") return `PART ${scene.index}`;
    return scene.index === 1 ? "BEFORE YOU START" : "GOOD TO KNOW";
  }
  if (steps.length === 1) return `STEP ${steps[0]}`;
  const contiguous = steps.every((n, i) => i === 0 || n === steps[i - 1] + 1);
  return contiguous ? `STEPS ${steps[0]}–${steps.at(-1)}` : `STEPS ${steps.join(", ")}`;
}

export interface OverlaySpec {
  badge: string;
  build?: string;
  title: string;
  counter: string;
  callouts: string[];
  warning?: string;
  insetPath?: string;
  insetLabel?: string;
}

const ACCENT = "#F2C14E";
const FONT = "DejaVu Sans, sans-serif";

/** One transparent 1280×720 layer with every label for the clip. */
export async function renderOverlay(spec: OverlaySpec, outputPath: string) {
  const W = VIDEO_WIDTH;
  const H = VIDEO_HEIGHT;
  const parts: string[] = [];
  parts.push(
    `<defs><linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.72"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></linearGradient></defs>`,
    `<rect x="0" y="0" width="${W}" height="190" fill="url(#top)"/>`,
    `<rect x="0" y="${H - 170}" width="${W}" height="170" fill="url(#bottom)"/>`,
  );

  const badgeWidth = Math.round(textWidth(spec.badge, 19, true, 1) + 30);
  parts.push(
    `<rect x="40" y="32" rx="8" ry="8" width="${badgeWidth}" height="36" fill="${ACCENT}"/>`,
    `<text x="${40 + 15}" y="57" font-family="${FONT}" font-size="19" font-weight="700" letter-spacing="1" fill="#14160f">${escapeXml(spec.badge)}</text>`,
  );
  if (spec.build) {
    parts.push(
      `<text x="${40 + badgeWidth + 16}" y="57" font-family="${FONT}" font-size="18" font-weight="700" letter-spacing="1.5" fill="#ffffff" fill-opacity="0.85">${escapeXml(spec.build.toUpperCase())}</text>`,
    );
  }
  parts.push(
    `<text x="${W - 40}" y="57" text-anchor="end" font-family="${FONT}" font-size="19" fill="#ffffff" fill-opacity="0.75">${escapeXml(spec.counter)}</text>`,
  );

  const titleLines = wrap(spec.title, 34, W - 120, 2, true);
  titleLines.forEach((line, i) => {
    const y = 112 + i * 42;
    parts.push(
      `<text x="42" y="${y + 2}" font-family="${FONT}" font-size="34" font-weight="700" fill="#000" fill-opacity="0.45">${escapeXml(line)}</text>`,
      `<text x="40" y="${y}" font-family="${FONT}" font-size="34" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`,
    );
  });

  const insetBox = { width: 0, height: 0 };
  let inset: Buffer | undefined;
  if (spec.insetPath) {
    try {
      const fitted = await sharp(spec.insetPath)
        .flatten({ background: "#ffffff" })
        .resize(300, 220, { fit: "inside", withoutEnlargement: false })
        .png()
        .toBuffer({ resolveWithObject: true });
      inset = fitted.data;
      insetBox.width = fitted.info.width;
      insetBox.height = fitted.info.height;
    } catch {
      inset = undefined;
    }
  }
  const insetLeft = W - 40 - insetBox.width - 16;
  const insetTop = H - 40 - insetBox.height - 16;
  if (inset) {
    parts.push(
      `<rect x="${insetLeft - 2}" y="${insetTop - 2}" rx="12" ry="12" width="${insetBox.width + 20}" height="${insetBox.height + 20}" fill="#000" fill-opacity="0.35"/>`,
      `<rect x="${insetLeft}" y="${insetTop}" rx="10" ry="10" width="${insetBox.width + 16}" height="${insetBox.height + 16}" fill="#ffffff"/>`,
    );
    if (spec.insetLabel) {
      const label = spec.insetLabel.toUpperCase();
      const labelWidth = Math.round(textWidth(label, 14, true, 1.5) + 20);
      parts.push(
        `<rect x="${insetLeft}" y="${insetTop - 34}" rx="6" ry="6" width="${labelWidth}" height="26" fill="#000" fill-opacity="0.62"/>`,
        `<text x="${insetLeft + 10}" y="${insetTop - 16}" font-family="${FONT}" font-size="14" font-weight="700" letter-spacing="1.5" fill="#ffffff">${escapeXml(label)}</text>`,
      );
    }
  }

  const rightEdge = inset ? insetLeft - 24 : W - 40;
  let cursorY = H - 40;
  if (spec.callouts.length) {
    let x = 40;
    const chips: string[] = [];
    for (const callout of spec.callouts) {
      const width = Math.round(textWidth(callout, 21) + 28);
      if (x + width > rightEdge) break;
      chips.push(
        `<rect x="${x}" y="${cursorY - 40}" rx="8" ry="8" width="${width}" height="40" fill="#14160f" fill-opacity="0.78"/>`,
        `<text x="${x + 14}" y="${cursorY - 13}" font-family="${FONT}" font-size="21" fill="#ffffff">${escapeXml(callout)}</text>`,
      );
      x += width + 10;
    }
    parts.push(...chips);
    cursorY -= 52;
  }
  if (spec.warning) {
    const maxWidth = Math.min(rightEdge - 40, 760);
    const lines = wrap(`CAUTION  ${spec.warning}`, 19, maxWidth - 32, 2, true);
    const height = 18 + lines.length * 26;
    const width = Math.round(Math.max(...lines.map((line) => textWidth(line, 19, true))) + 32);
    parts.push(
      `<rect x="40" y="${cursorY - height}" rx="8" ry="8" width="${Math.min(width, maxWidth)}" height="${height}" fill="#C45C26" fill-opacity="0.92"/>`,
    );
    lines.forEach((line, i) => {
      parts.push(
        `<text x="56" y="${cursorY - height + 32 + i * 26}" font-family="${FONT}" font-size="19" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`,
      );
    });
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join("")}</svg>`;
  const layer = sharp(Buffer.from(svg));
  const composed = inset
    ? layer.composite([{ input: inset, left: insetLeft + 8, top: insetTop + 8 }])
    : layer;
  await composed.png({ compressionLevel: 2 }).toFile(outputPath);
}

/** Manual drawing centred on a white 16:9 card, used when no photo could be made. */
export async function drawingCard(drawingPath: string, outputPath: string) {
  const fitted = await sharp(drawingPath)
    .flatten({ background: "#ffffff" })
    .resize(1440, 640, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  await sharp({
    create: { width: 1536, height: 864, channels: 3, background: "#f6f4ef" },
  })
    .composite([
      {
        input: fitted.data,
        left: Math.round((1536 - fitted.info.width) / 2),
        top: Math.round((864 - fitted.info.height) / 2) + 60,
      },
    ])
    .png({ compressionLevel: 1 })
    .toFile(outputPath);
}

function motionExpressions(motion: CameraMotion | undefined, frames: number) {
  const d = Math.max(frames - 1, 1);
  const e = `((on/${d})*(on/${d})*(3-2*(on/${d})))`;
  const center = { x: "(iw-iw/zoom)/2", y: "(ih-ih/zoom)/2" };
  switch (motion) {
    case "slow_zoom_out":
      return { z: `1.10-0.10*${e}`, ...center };
    case "slow_left_to_right":
      return { z: "1.10", x: `(0.12+0.76*${e})*(iw-iw/zoom)`, y: center.y };
    case "slow_right_to_left":
      return { z: "1.10", x: `(0.88-0.76*${e})*(iw-iw/zoom)`, y: center.y };
    case "static":
      return { z: `1+0.04*${e}`, ...center };
    default:
      return { z: `1+0.10*${e}`, ...center };
  }
}

/** Scene length on the frame grid; the voice track uses the same value so picture and sound line up. */
export function clipSeconds(seconds: number) {
  return Math.max(2, Math.round(seconds * VIDEO_FPS) / VIDEO_FPS);
}

/** Eased camera move over the photo, labels on top. Picture only; the voice is laid in at the stitch. */
export async function renderSceneClip(options: {
  framePath: string;
  overlayPath: string;
  outputPath: string;
  seconds: number;
  motion?: CameraMotion;
  threads?: number;
}) {
  const seconds = clipSeconds(options.seconds);
  const frames = Math.round(seconds * VIDEO_FPS);
  const threads = String(Math.max(1, Math.floor(options.threads ?? cpuBudget())));
  const canvasPath = `${options.outputPath}.canvas.jpg`;
  await sharp(options.framePath)
    .resize(VIDEO_WIDTH * 2, VIDEO_HEIGHT * 2, { fit: "cover", kernel: "lanczos3" })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toFile(canvasPath);

  const m = motionExpressions(options.motion, frames);
  const fades = `fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(seconds - 0.4, 0).toFixed(2)}:d=0.4`;
  const filter = `[0:v]zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${frames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${VIDEO_FPS},setsar=1[bg];[bg][1:v]overlay=0:0:format=auto,${fades},format=yuv420p[v]`;
  try {
    await runFfmpeg([
      "-i",
      canvasPath,
      "-i",
      options.overlayPath,
      "-filter_complex",
      filter,
      "-filter_complex_threads",
      threads,
      "-map",
      "[v]",
      "-an",
      "-t",
      seconds.toFixed(3),
      "-r",
      String(VIDEO_FPS),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      VIDEO_CRF,
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-g",
      String(VIDEO_FPS * 2),
      "-threads",
      threads,
      "-movflags",
      "+faststart",
      options.outputPath,
    ]);
  } finally {
    await unlink(canvasPath).catch(() => undefined);
  }
  return { seconds };
}

/** The scene's finished picture: the photo at 720p with its labels burned in. */
export async function renderStill(options: { framePath: string; overlayPath: string; outputPath: string }) {
  await sharp(options.framePath)
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, { fit: "cover", kernel: "lanczos3" })
    .composite([{ input: options.overlayPath, left: 0, top: 0 }])
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toFile(options.outputPath);
}

function concatEntry(filePath: string) {
  return `file '${filePath.replace(/'/g, "'\\''")}'`;
}

function subtitleArgs(subtitlesPath?: string) {
  return subtitlesPath
    ? {
        input: ["-i", subtitlesPath],
        map: ["-map", "2:s"],
        codec: ["-c:s", "mov_text", "-metadata:s:s:0", "language=eng"],
      }
    : { input: [], map: [], codec: [] };
}

/**
 * A still-frame film in one pass: each scene's picture is a single keyframe
 * held for the scene's length (variable frame rate), so the encoder codes a
 * dozen frames instead of thousands of copies. The voice is copied.
 */
export async function encodeStillFilm(options: {
  stills: Array<{ path: string; seconds: number }>;
  audioPath: string;
  outputPath: string;
  listPath: string;
  subtitlesPath?: string;
}) {
  const last = options.stills.at(-1);
  if (!last) throw new Error("No scenes to encode");
  const list = [
    "ffconcat version 1.0",
    ...options.stills.flatMap((still) => [concatEntry(still.path), `duration ${still.seconds.toFixed(3)}`]),
    // The concat demuxer drops the last entry's duration unless another entry follows it.
    concatEntry(last.path),
  ];
  await writeFile(options.listPath, `${list.join("\n")}\n`);
  const subtitles = subtitleArgs(options.subtitlesPath);
  await runFfmpeg(
    [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      options.listPath,
      "-i",
      options.audioPath,
      ...subtitles.input,
      "-map",
      "0:v",
      "-map",
      "1:a",
      ...subtitles.map,
      "-vf",
      "format=yuv420p,setsar=1",
      "-fps_mode",
      "vfr",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "stillimage",
      "-crf",
      STILL_CRF,
      "-profile:v",
      "high",
      "-g",
      "1",
      "-threads",
      String(Math.max(1, Math.floor(cpuBudget()))),
      "-c:a",
      "copy",
      ...subtitles.codec,
      "-movflags",
      "+faststart",
      options.outputPath,
    ],
    180_000,
  );
}

/** Every stream is copied: the clips' picture, the encoded voice track, and soft subtitles. */
export async function stitchClips(options: {
  clipPaths: string[];
  audioPath: string;
  outputPath: string;
  listPath: string;
  subtitlesPath?: string;
}) {
  await writeFile(options.listPath, options.clipPaths.map(concatEntry).join("\n"));
  const subtitles = subtitleArgs(options.subtitlesPath);
  await runFfmpeg(
    [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      options.listPath,
      "-i",
      options.audioPath,
      ...subtitles.input,
      "-map",
      "0:v",
      "-map",
      "1:a",
      ...subtitles.map,
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      ...subtitles.codec,
      "-movflags",
      "+faststart",
      options.outputPath,
    ],
    180_000,
  );
}

export function formatTimestamp(totalSeconds: number, separator = ".") {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

export function buildChaptersVtt(
  scenes: Scene[],
  seconds = SCENE_SECONDS,
  durations?: number[],
) {
  const lines = ["WEBVTT", ""];
  let cursor = 0;
  scenes.forEach((scene, i) => {
    const length = durations?.[i] ?? scene.durationSeconds ?? seconds;
    const start = formatTimestamp(cursor);
    cursor += length;
    const end = formatTimestamp(cursor);
    const label = scene.steps?.length ? `${stepLabel(scene.steps)} — ${scene.title}` : scene.title;
    lines.push(`${start} --> ${end}`, label, "");
  });
  return lines.join("\n");
}

export function concatDir(jobPath: string) {
  return path.join(jobPath, "concat.txt");
}
