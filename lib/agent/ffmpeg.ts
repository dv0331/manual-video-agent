import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { FONT_BOLD_PATH, FONT_PATH } from "@/lib/agent/paths";
import type { Scene } from "@/lib/agent/types";
import { SCENE_SECONDS } from "@/lib/agent/types";

export function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "csv=p=0",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", () => resolve(false));
    child.on("close", () => resolve(/audio/i.test(out)));
  });
}

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

function calloutOverlays(scene: Scene, totalScenes: number) {
  const title = escapeDrawtext(
    `STEP ${String(scene.index).padStart(2, "0")} / ${String(totalScenes).padStart(2, "0")}  ·  ${scene.title}`,
  );
  const callouts = escapeDrawtext(
    wrapLine(scene.onScreenCallouts.join("   ·   ") || scene.narration, 78),
  );
  const warning = scene.warnings[0]
    ? escapeDrawtext(`WARNING  ${wrapLine(scene.warnings[0], 70)}`)
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
  return overlays;
}

export async function kenBurnsClip(options: {
  framePath: string;
  outputPath: string;
  scene: Scene;
  totalScenes: number;
  seconds?: number;
  audioPath?: string;
}) {
  const seconds = options.seconds ?? SCENE_SECONDS;
  const frames = seconds * 25;
  const overlays = calloutOverlays(options.scene, options.totalScenes);

  const filter = [
    `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720`,
    `zoompan=z='min(zoom+0.0007,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=25`,
    ...overlays,
  ].join(",");

  const audioIn = options.audioPath
    ? ["-i", options.audioPath]
    : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];

  await runFfmpeg([
    "-loop",
    "1",
    "-i",
    options.framePath,
    ...audioIn,
    "-vf",
    filter,
    "-af",
    `apad=whole_dur=${seconds}`,
    "-t",
    String(seconds),
    "-r",
    "25",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-shortest",
    "-movflags",
    "+faststart",
    options.outputPath,
  ]);
}

export async function burnCalloutsOnVideo(options: {
  inputPath: string;
  outputPath: string;
  scene: Scene;
  totalScenes: number;
}) {
  const overlays = calloutOverlays(options.scene, options.totalScenes);
  const filter = [
    `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720`,
    ...overlays,
  ].join(",");
  try {
    await runFfmpeg([
      "-i",
      options.inputPath,
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      options.outputPath,
    ]);
    return;
  } catch {
    await runFfmpeg([
      "-i",
      options.inputPath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      options.outputPath,
    ]);
  }
}

export async function muxNarration(options: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  seconds: number;
}) {
  const ambient = await hasAudioStream(options.videoPath);
  if (ambient) {
    await runFfmpeg([
      "-i",
      options.videoPath,
      "-i",
      options.audioPath,
      "-filter_complex",
      `[0:a]volume=0.18,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[amb];[1:a]volume=1.2,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,apad=whole_dur=${options.seconds}[nar];[amb][nar]amix=inputs=2:duration=first:dropout_transition=0[a]`,
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-t",
      String(options.seconds),
      "-movflags",
      "+faststart",
      options.outputPath,
    ]);
    return;
  }
  await runFfmpeg([
    "-i",
    options.videoPath,
    "-i",
    options.audioPath,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-af",
    `apad=whole_dur=${options.seconds}`,
    "-t",
    String(options.seconds),
    "-shortest",
    "-movflags",
    "+faststart",
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
  const rawPath = `${options.outputPath}.raw.mp4`;
  await runFfmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    options.listPath,
    "-c",
    "copy",
    rawPath,
  ]);
  await makeSafariPlayable(rawPath, options.outputPath);
}

export async function makeSafariPlayable(inputPath: string, outputPath: string) {
  if (await hasAudioStream(inputPath)) {
    await runFfmpeg([
      "-i",
      inputPath,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    return;
  }
  await runFfmpeg([
    "-i",
    inputPath,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
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
    const start = formatVtt(cursor);
    cursor += length;
    const end = formatVtt(cursor);
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
