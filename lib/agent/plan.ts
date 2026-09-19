import { applyHumanAssemblyDirection } from "@/lib/agent/human-assembly";
import { sleep } from "@/lib/agent/pool";
import { demoProvider } from "@/lib/agent/providers/demo";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, IngestResult, Scene } from "@/lib/agent/types";

function attachFigures(graph: AssemblyGraph, ingest: IngestResult, scenes: Scene[]) {
  return scenes.map((scene, i) => {
    const figurePath = ingest.figureImages[i] ?? ingest.pageImages[i];
    return applyHumanAssemblyDirection(graph, {
      ...scene,
      figurePath,
    });
  });
}

export async function planStoryboard(
  provider: MediaProvider,
  graph: AssemblyGraph,
  ingest: IngestResult,
): Promise<Scene[]> {
  const fallback = attachFigures(graph, ingest, await demoProvider.plan(graph));
  if (provider.name === "demo") return fallback;

  const llm = provider
    .plan(graph)
    .then((scenes) => (scenes.length ? attachFigures(graph, ingest, scenes) : fallback))
    .catch((error) => {
      console.warn("Director plan timed out or failed; using graph-faithful scenes", error);
      return fallback;
    });

  const raced = await Promise.race([llm, sleep(6000).then(() => null)]);
  if (raced && raced.length) return raced;

  const late = await Promise.race([llm, sleep(1).then(() => fallback)]);
  return late.length ? late : fallback;
}
