import { readFile } from "node:fs/promises";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, EvaluationScores, Scene } from "@/lib/agent/types";

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
    frame: {
      mimeType: "image/png",
      base64: (await readFile(options.framePath)).toString("base64"),
    },
    previousFrame: options.previousFramePath
      ? {
          mimeType: "image/png",
          base64: (await readFile(options.previousFramePath)).toString("base64"),
        }
      : undefined,
    knownPartIds,
  });
}
