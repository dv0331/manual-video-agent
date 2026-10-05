import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ingestSource } from "@/lib/agent/ingest";
import { jobDir } from "@/lib/agent/paths";
import { planStoryboard } from "@/lib/agent/plan";
import { generateAllScenes } from "@/lib/agent/generate";
import { logProduction } from "@/lib/agent/production-log";
import { getMediaProvider } from "@/lib/agent/providers";
import { stitchJob } from "@/lib/agent/stitch";
import { failJob, loadJob, setStage, updateJob } from "@/lib/agent/store";
import { fastCut } from "@/lib/agent/fast";
import { startTraceHeartbeat, trace, withJobTrace } from "@/lib/agent/trace";
import { understandManual } from "@/lib/agent/understand";
import { hydrateSampleFilm, shouldUseSampleFilm } from "@/lib/sample-manual/films";

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
  const stopHeartbeat = startTraceHeartbeat(dir);
  try {
    await withJobTrace(dir, () => runJobBody(id, dir, file));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The agent failed";
    await trace(`Stopped: ${message}`).catch(() => undefined);
    await failJob(id, message);
  } finally {
    stopHeartbeat();
  }
}

async function runJobBody(
  id: string,
  dir: string,
  file?: { name: string; buffer: Buffer; mimeType: string },
) {
  try {
    const existing = await loadJob(id);
    if (existing && shouldUseSampleFilm(existing.sampleId)) {
      await hydrateSampleFilm(id, existing.sampleId as string);
      return;
    }

    const provider = getMediaProvider();
    await updateJob(id, { provider: provider.name, status: "running" });
    await trace(
      fastCut()
        ? `Provider ${provider.name}. Fast cut on — finish in under 60s`
        : `Provider ${provider.name}`,
    );

    await setStage(id, "ingest", "Reading the manual and pulling figures", 8);
    await trace("Reading the manual and pulling figures");
    const current = await loadJob(id);
    if (!current) throw new Error("Job disappeared");
    await logProduction(dir, `Starting production for ${current.sourceName}`);
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
      sampleId: current.sampleId,
      file: sourceFile,
    });
    await writeFile(path.join(dir, "extracted.txt"), ingest.text);

    await setStage(id, "understand", "Building the assembly graph from the source", 22);
    await trace("Building the assembly graph from the source");
    const graph = await understandManual(provider, ingest, current.sampleId);
    await updateJob(id, { graph });

    await setStage(id, "plan", "Planning a multi-scene storyboard", 34);
    await trace("Planning a multi-scene storyboard");
    const scenes = await planStoryboard(provider, graph, ingest);
    await updateJob(id, { scenes });

    await logProduction(
      dir,
      `Plan locked: ${scenes.length} scenes — stills, voices, and judges in parallel`,
    );
    await setStage(
      id,
      "generate",
      `Shooting all ${scenes.length} scenes at once`,
      42,
    );
    await trace(`Shooting all ${scenes.length} scenes at once`);
    const results = await generateAllScenes({
      provider,
      scenes,
      graph,
      jobPath: dir,
      onScene: async (done, total, label) => {
        const pct = 42 + Math.round((done / Math.max(total, 1)) * 48);
        await trace(label);
        await updateJob(id, {
          stage: "generate",
          stageLabel: label,
          progress: Math.min(pct, 90),
          log: label,
        });
      },
    });
    await updateJob(id, {
      sceneResults: results,
      log: `All ${results.length} scenes cut (${results.filter((r) => r.evaluation.passed).length} passed judge)`,
    });

    await setStage(id, "stitch", "Stitching clips and writing chapter markers", 92);
    await trace("Stitching clips and writing chapter markers");
    const { videoPath, vttPath, captionsPath } = await stitchJob({
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
      captionsPath,
      sceneResults: results,
      log: "Cut the chaptered assembly film with spoken steps",
    });
    await trace("Assembly video ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "The agent failed";
    await trace(`Stopped: ${message}`);
    await failJob(id, message);
  }
}
