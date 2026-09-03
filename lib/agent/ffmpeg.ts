import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { FONT_BOLD_PATH, FONT_PATH } from "@/lib/agent/paths";
import type { Scene } from "@/lib/agent/types";
import { SCENE_SECONDS } from "@/lib/agent/types";

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-1200) || `ffmpeg exited ${code}`));
    });
  });
}

function escapeDrawtext(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

function wrapLine(text: string, max = 72) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).join("\n");
}

export async function kenBurnsClip(options: {
  framePath: string;
  outputPath: string;
  scene: Scene;
  totalScenes: number;
  seconds?: number;
}) {
  const seconds = options.seconds ?? SCENE_SECONDS;
  const frames = seconds * 25;
  const title = escapeDrawtext(
    `STEP ${String(options.scene.index).padStart(2, "0")} / ${String(options.totalScenes).padStart(2, "0")}  ·  ${options.scene.title}`,
  );
  const callouts = escapeDrawtext(
    wrapLine(options.scene.onScreenCallouts.join("   ·   ") || options.scene.narration, 78),
  );
  const warning = options.scene.warnings[0]
    ? escapeDrawtext(`WARNING  ${wrapLine(options.scene.warnings[0], 70)}`)
    : "";

  const overlays = [
    `drawbox=x=0:y=0:w=iw:h=86:color=black@0.62:t=fill`,
    `drawtext=fontfile=${FONT_BOLD_PATH}:fontsize=28:fontcolor=0xF2C14E:x=36:y=28:text='${title}'`,
    `drawbox=x=0:y=ih-92:w=iw:h=92:color=black@0.58:t=fill`,
    `drawtext=fontfile=${FONT_PATH}:fontsize=22:fontcolor=white:x=36:y=h-68:line_spacing=8:text='${callouts}'`,
  ];

  if (warning) {
    overlays.splice(
      2,
      0,
      `drawbox=x=0:y=86:w=iw:h=46:color=0xC45C26@0.88:t=fill`,
      `drawtext=fontfile=${FONT_BOLD_PATH}:fontsize=18:fontcolor=white:x=36:y=98:text='${warning}'`,
    );
  }

  const filter = [
    `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720`,
    `zoompan=z='min(zoom+0.0007,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=25`,
    ...overlays,
  ].join(",");

  await runFfmpeg([
    "-loop",
    "1",
    "-i",
    options.framePath,
    "-vf",
    filter,
    "-t",
    String(seconds),
    "-r",
    "25",
    "-pix_fmt",
    "yuv420p",
    "-an",
    options.outputPath,
  ]);
}

export async function stitchClips(options: {
  clipPaths: string[];
  outputPath: string;
  listPath: string;
}) {
  const list = options.clipPaths
    .map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(options.listPath, list);
  await runFfmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    options.listPath,
    "-c",
    "copy",
    options.outputPath,
  ]);
}

export function buildChaptersVtt(scenes: Scene[], seconds = SCENE_SECONDS) {
  const lines = ["WEBVTT", ""];
  scenes.forEach((scene, i) => {
    const start = formatVtt(i * seconds);
    const end = formatVtt((i + 1) * seconds);
    lines.push(`${start} --> ${end}`, `Step ${scene.index} — ${scene.title}`, "");
  });
  return lines.join("\n");
}

function formatVtt(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.000`;
}

export function concatDir(jobPath: string) {
  return path.join(jobPath, "concat.txt");
}
