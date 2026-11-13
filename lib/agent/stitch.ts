import { writeFile } from "node:fs/promises";
import path from "node:path";
import { buildChaptersVtt, concatDir, encodeStillFilm, stitchClips } from "@/lib/agent/ffmpeg";
import { buildCaptions } from "@/lib/agent/narration";
import { traceFailure } from "@/lib/agent/trace";
import type { SceneResult } from "@/lib/agent/types";

export async function stitchJob(options: { jobPath: string; results: SceneResult[]; voiceTrack: string }) {
  const videoPath = path.join(options.jobPath, "output.mp4");
  const vttPath = path.join(options.jobPath, "chapters.vtt");
  const captionsPath = path.join(options.jobPath, "captions.vtt");
  const srtPath = path.join(options.jobPath, "captions.srt");
  const scenes = options.results.map((r) => r.scene);
  const durations = options.results.map((r) => r.durationSeconds);
  const captions = buildCaptions(scenes, durations);

  await Promise.all([
    writeFile(vttPath, buildChaptersVtt(scenes, undefined, durations)),
    writeFile(captionsPath, captions.vtt),
    writeFile(srtPath, captions.srt),
  ]);

  const target = { audioPath: options.voiceTrack, outputPath: videoPath, listPath: concatDir(options.jobPath) };
  const stills = options.results.flatMap((r) => (r.stillPath ? [{ path: r.stillPath, seconds: r.durationSeconds }] : []));
  const cut = (subtitlesPath?: string) =>
    stills.length === options.results.length
      ? encodeStillFilm({ ...target, stills, subtitlesPath })
      : stitchClips({ ...target, clipPaths: options.results.map((r) => r.clipPath), subtitlesPath });
  try {
    await cut(srtPath);
  } catch (error) {
    await traceFailure("Embedding captions", error, "stitching without the subtitle track");
    await cut();
  }

  await writeFile(path.join(options.jobPath, "storyboard.json"), JSON.stringify(scenes, null, 2));
  await writeFile(
    path.join(options.jobPath, "evaluation.json"),
    JSON.stringify(
      options.results.map((r) => ({
        sceneId: r.scene.id,
        attempts: r.attempts,
        motionSource: r.motionSource,
        evaluation: r.evaluation,
      })),
      null,
      2,
    ),
  );
  return { videoPath, vttPath, captionsPath };
}
