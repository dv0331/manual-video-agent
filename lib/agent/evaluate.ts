import sharp from "sharp";
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
  return options.provider.evaluateFrame({
    scene: options.scene,
    frame: await compactImage(options.framePath),
    previousFrame: options.previousFramePath
      ? await compactImage(options.previousFramePath)
      : undefined,
    knownPartIds,
  });
}
