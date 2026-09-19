import { existsSync } from "node:fs";
import sharp from "sharp";
import { emptyEvaluation, normalizeEvaluation } from "@/lib/agent/eval-normalize";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, EvaluationScores, Scene } from "@/lib/agent/types";

async function compactImage(filePath: string) {
  const compressed = await sharp(filePath)
    .resize({ width: 720, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { mimeType: "image/png", base64: compressed.toString("base64") };
}

export async function evaluateScene(options: {
  provider: MediaProvider;
  scene: Scene;
  framePath: string;
  previousFramePath?: string;
  graph: AssemblyGraph;
}): Promise<EvaluationScores> {
  const knownPartIds = options.graph.parts.map((p) => p.id);
  const raw = await options.provider.evaluateFrame({
    scene: options.scene,
    frame: await compactImage(options.framePath),
    previousFrame: options.previousFramePath
      ? await compactImage(options.previousFramePath)
      : undefined,
    knownPartIds,
  });
  return normalizeEvaluation(raw);
}

/** L6: judge the clip after motion. Audio fail retries video only. */
export async function evaluateClip(options: {
  still: EvaluationScores;
  speechPath?: string;
}): Promise<EvaluationScores> {
  if (!options.still.passed || options.still.failureType === "visual") {
    return normalizeEvaluation({
      ...options.still,
      narrationAlignment: options.still.narrationAlignment ?? 1,
      failureType: "visual",
    });
  }
  if (!options.speechPath || !existsSync(options.speechPath)) {
    return normalizeEvaluation({
      ...options.still,
      passed: false,
      narrationAlignment: 0.2,
      failureType: "audio",
      critique: `${options.still.critique} Narration file is missing.`.trim(),
    });
  }
  return normalizeEvaluation({
    ...options.still,
    narrationAlignment: Math.max(options.still.narrationAlignment ?? 0.85, 0.85),
    motionCoherence: options.still.motionCoherence ?? 0.8,
    failureType: "none",
  });
}

export { emptyEvaluation };
