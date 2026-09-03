import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ingestSource } from "@/lib/agent/ingest";
import { jobDir } from "@/lib/agent/paths";
import { planStoryboard } from "@/lib/agent/plan";
import { generateScene } from "@/lib/agent/generate";
import { getMediaProvider } from "@/lib/agent/providers";
import { stitchJob } from "@/lib/agent/stitch";
import { failJob, setStage, updateJob } from "@/lib/agent/store";
import { understandManual } from "@/lib/agent/understand";
import type { SceneResult } from "@/lib/agent/types";

const running = new Set<string>();

export function startJob(id: string, file?: { name: string; buffer: Buffer; mimeType: string }) {
  if (running.has(id)) return;
  running.add(id);
  void runJob(id, file).finally(() => running.delete(id));
}

export async function runJob(
  id: string,
  file?: { name: string; buffer: Buffer; mimeType: string },
) {
  const dir = jobDir(id);
  try {
    const provider = getMediaProvider();
    await updateJob(id, { provider: provider.name, status: "running" });

    await setStage(id, "ingest", "Reading the manual and pulling figures", 8);
    const { loadJob } = await import("@/lib/agent/store");
    const current = await loadJob(id);
    if (!current) throw new Error("Job disappeared");
    let sourceFile = file;
    if (!sourceFile && current.sourceKind === "upload") {
      const { readFile } = await import("node:fs/promises");
      const { existsSync } = await import("node:fs");
      const pdf = path.join(dir, "source.pdf");
      const png = path.join(dir, "source.png");
      if (existsSync(pdf)) {
        sourceFile = {
          name: current.sourceName,
          buffer: await readFile(pdf),
          mimeType: "application/pdf",
        };
      } else if (existsSync(png)) {
        sourceFile = {
          name: current.sourceName,
          buffer: await readFile(png),
          mimeType: "image/png",
        };
      }
    }
    const ingest = await ingestSource({
      jobPath: dir,
      kind: current.sourceKind,
      file: sourceFile,
    });
    await writeFile(path.join(dir, "extracted.txt"), ingest.text);

    await setStage(id, "understand", "Building the assembly graph from the source", 22);
    const graph = await understandManual(provider, ingest);
    await updateJob(id, { graph });

    await setStage(id, "plan", "Planning a multi-scene storyboard", 34);
    const scenes = await planStoryboard(provider, graph, ingest);
    await updateJob(id, { scenes });

    const results: SceneResult[] = [];
    for (const [i, scene] of scenes.entries()) {
      const pct = 40 + Math.round((i / Math.max(scenes.length, 1)) * 45);
      await setStage(
        id,
        "generate",
        `Generating and evaluating scene ${i + 1} of ${scenes.length}`,
        pct,
        { sceneResults: results },
      );
      const result = await generateScene({
        provider,
        scene,
        graph,
        jobPath: dir,
        previousFramePath: results.at(-1)?.framePath,
        totalScenes: scenes.length,
      });
      results.push(result);
      await updateJob(id, {
        sceneResults: results,
        log: `Scene ${scene.index} ${result.evaluation.passed ? "passed" : "accepted after retries"} (${result.motionSource}, ${result.attempts} attempt${result.attempts === 1 ? "" : "s"})`,
      });
    }

    await setStage(id, "stitch", "Stitching clips and writing chapter markers", 92);
    const { videoPath, vttPath } = await stitchJob({
      jobPath: dir,
      scenes,
      results,
    });

    await updateJob(id, {
      status: "completed",
      stage: "done",
      stageLabel: "Assembly video ready",
      progress: 100,
      videoPath,
      vttPath,
      sceneResults: results,
      log: "Stitched the chaptered assembly video",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The agent failed";
    await failJob(id, message);
  }
}
