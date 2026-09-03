import { writeFile } from "node:fs/promises";
import path from "node:path";
import { buildChaptersVtt, concatDir, stitchClips } from "@/lib/agent/ffmpeg";
import type { Scene, SceneResult } from "@/lib/agent/types";

export async function stitchJob(options: {
  jobPath: string;
  scenes: Scene[];
  results: SceneResult[];
}) {
  const videoPath = path.join(options.jobPath, "output.mp4");
  const vttPath = path.join(options.jobPath, "chapters.vtt");
  await stitchClips({
    clipPaths: options.results.map((r) => r.clipPath),
    outputPath: videoPath,
    listPath: concatDir(options.jobPath),
  });
  await writeFile(vttPath, buildChaptersVtt(options.scenes));
  await writeFile(
    path.join(options.jobPath, "storyboard.json"),
    JSON.stringify(options.scenes, null, 2),
  );
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
  return { videoPath, vttPath };
}
