import { applyHumanAssemblyDirection } from "@/lib/agent/human-assembly";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, IngestResult, Scene } from "@/lib/agent/types";

export async function planStoryboard(
  provider: MediaProvider,
  graph: AssemblyGraph,
  ingest: IngestResult,
): Promise<Scene[]> {
  const scenes = await provider.plan(graph);
  return scenes.map((scene, i) => {
    const figurePath = ingest.figureImages[i] ?? ingest.pageImages[i];
    return applyHumanAssemblyDirection(graph, {
      ...scene,
      figurePath,
    });
  });
}
