import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { generateAllScenes } from "@/lib/agent/generate";
import { ingestSource } from "@/lib/agent/ingest";
import { filmIdFor, findFilmDir, loadFilm, openFilmInJob, saveJobFilm } from "@/lib/agent/library";
import { jobDir } from "@/lib/agent/paths";
import { planStoryboard } from "@/lib/agent/plan";
import { logProduction } from "@/lib/agent/production-log";
import { getMediaProvider } from "@/lib/agent/providers";
import type { MediaProvider } from "@/lib/agent/providers/types";
import { stitchJob } from "@/lib/agent/stitch";
import { failJob, loadJob, setStage, updateJob } from "@/lib/agent/store";
import {
  scenesFromStoryboard,
  storyboardToGraph,
  type Storyboard,
  type StoryboardPage,
} from "@/lib/agent/storyboard";
import { startTraceHeartbeat, trace, traceFailure, withJobTrace } from "@/lib/agent/trace";
import type { AssemblyGraph, IngestResult, Job, Scene } from "@/lib/agent/types";
import { understandManual } from "@/lib/agent/understand";
import { hydrateSampleFilm, shouldUseSampleFilm } from "@/lib/sample-manual/films";

type SourceFile = { name: string; buffer: Buffer; mimeType: string };

const running = new Set<string>();

export function startJob(id: string, file?: SourceFile, options: { fresh?: boolean } = {}) {
  if (running.has(id)) return;
  running.add(id);
  void runJob(id, file, options).finally(() => running.delete(id));
}

export async function runJob(id: string, file?: SourceFile, options: { fresh?: boolean } = {}) {
  const dir = jobDir(id);
  const stopHeartbeat = startTraceHeartbeat(dir);
  try {
    await withJobTrace(dir, () => runJobBody(id, dir, file, options));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The agent failed";
    await trace(`Stopped: ${message}`).catch(() => undefined);
    await failJob(id, message);
  } finally {
    stopHeartbeat();
  }
}

const since = (start: number) => Math.round((Date.now() - start) / 100) / 10;

async function sourceFromDisk(job: Job, dir: string): Promise<SourceFile | undefined> {
  const filmDir = job.filmId ? findFilmDir(job.filmId) : null;
  if (!existsSync(path.join(dir, "source.pdf")) && filmDir && existsSync(path.join(filmDir, "source.pdf"))) {
    await copyFile(path.join(filmDir, "source.pdf"), path.join(dir, "source.pdf"));
  }
  for (const [name, mimeType] of [
    ["source.pdf", "application/pdf"],
    ["source.png", "image/png"],
  ] as const) {
    const filePath = path.join(/* turbopackIgnore: true */ dir, name);
    if (existsSync(/* turbopackIgnore: true */ filePath)) {
      return { name: job.sourceName, buffer: await readFile(/* turbopackIgnore: true */ filePath), mimeType };
    }
  }
  return undefined;
}

async function storyboardPages(ingest: IngestResult): Promise<StoryboardPage[]> {
  return Promise.all(
    ingest.pageImages.map(async (filePath, i) => {
      const jpeg = await sharp(filePath)
        .flatten({ background: "#ffffff" })
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      return {
        page: i + 1,
        text: ingest.pageTexts[i] ?? "",
        dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      };
    }),
  );
}

async function writeStoryboard(
  provider: MediaProvider,
  job: Job,
  ingest: IngestResult,
  dir: string,
): Promise<{ graph: AssemblyGraph; scenes: Scene[]; product: string; look: string; kind: Storyboard["kind"] } | null> {
  if (!provider.storyboard || job.sourceKind !== "upload" || !ingest.pageImages.length) return null;
  try {
    const board = await provider.storyboard({
      sourceName: job.sourceName,
      pages: await storyboardPages(ingest),
    });
    await writeFile(path.join(dir, "storyboard-board.json"), JSON.stringify(board, null, 2));
    return {
      graph: storyboardToGraph(board),
      scenes: scenesFromStoryboard(board),
      product: board.product,
      look: board.look,
      kind: board.kind,
    };
  } catch (error) {
    await traceFailure("Storyboard", error, "falling back to the step parser");
    return null;
  }
}

async function runJobBody(id: string, dir: string, file: SourceFile | undefined, options: { fresh?: boolean }) {
  const started = Date.now();
  const timings: NonNullable<Job["timings"]> = {};
  const current = await loadJob(id);
  if (!current) throw new Error("Job disappeared");

  if (shouldUseSampleFilm(current.sampleId)) {
    await hydrateSampleFilm(id, current.sampleId as string);
    return;
  }
  if (!options.fresh && current.sourceHash) {
    const film = await loadFilm(filmIdFor(current.sourceHash));
    if (film) {
      await openFilmInJob(id, film.manifest.id, "Same manual as a saved film — opened it");
      await trace(`Same file as saved film ${film.manifest.id}; opened it instead of rendering`);
      return;
    }
  }

  const provider = getMediaProvider();
  await updateJob(id, { provider: provider.name, status: "running", error: undefined });
  await trace(`Provider ${provider.name}`);
  await logProduction(dir, `Starting production for ${current.sourceName}`);

  await setStage(id, "ingest", "Reading every page of the manual", 5);
  const stageStart = Date.now();
  const ingest = await ingestSource({
    jobPath: dir,
    kind: current.sourceKind,
    sampleId: current.sampleId,
    file: file ?? (current.sourceKind === "upload" ? await sourceFromDisk(current, dir) : undefined),
  });
  await writeFile(path.join(dir, "extracted.txt"), ingest.text);
  timings.ingest = since(stageStart);
  await trace(`Read ${ingest.pageImages.length} pages in ${timings.ingest}s`);

  await setStage(id, "plan", "Writing the storyboard from every page", 12, { timings });
  const boardStart = Date.now();
  let plan = await writeStoryboard(provider, current, ingest, dir);
  if (!plan) {
    await setStage(id, "understand", "Building the assembly steps from the text", 16);
    const graph = await understandManual(provider, ingest, current.sampleId);
    const scenes = await planStoryboard(provider, graph, ingest);
    plan = { graph, scenes, product: graph.title, look: "", kind: "assembly" };
  }
  timings.storyboard = since(boardStart);
  const { graph, scenes, product, look, kind } = plan;
  await updateJob(id, { graph, scenes, timings });
  await trace(
    `Storyboard locked: ${scenes.length} scenes for ${product}${look ? ` (${look})` : ""} in ${timings.storyboard}s`,
  );

  await setStage(id, "generate", `Shooting all ${scenes.length} scenes at once`, 25);
  const scenesStart = Date.now();
  const { results, voiceTrack } = await generateAllScenes({
    provider,
    scenes,
    product,
    look,
    kind,
    jobPath: dir,
    pageImages: ingest.pageImages,
    onScene: async (done, total, label) => {
      await updateJob(id, {
        stage: "generate",
        stageLabel: label,
        progress: Math.min(25 + Math.round((done / Math.max(total, 1)) * 65), 90),
        log: label,
      });
    },
  });
  timings.scenes = since(scenesStart);
  await updateJob(id, {
    scenes: results.map((r) => r.scene),
    sceneResults: results,
    timings,
    log: `All ${results.length} scenes ready in ${timings.scenes}s (${results.filter((r) => r.evaluation.passed).length} passed the judge)`,
  });

  await setStage(id, "stitch", "Cutting the film and writing chapters and captions", 92);
  const stitchStart = Date.now();
  const { videoPath, vttPath, captionsPath } = await stitchJob({ jobPath: dir, results, voiceTrack });
  timings.stitch = since(stitchStart);
  timings.total = since(started);

  await updateJob(id, {
    status: "completed",
    stage: "done",
    stageLabel: "Assembly video ready",
    progress: 100,
    videoPath,
    vttPath,
    captionsPath,
    timings,
    log: `Film ready in ${timings.total}s`,
  });
  await trace(
    `Film ready in ${timings.total}s — pages ${timings.ingest}s, storyboard ${timings.storyboard}s, scenes ${timings.scenes}s, stitch ${timings.stitch}s`,
  );

  try {
    const filmId = await saveJobFilm(id);
    if (filmId) await trace(`Saved to the film library as ${filmId}`);
  } catch (error) {
    await traceFailure("Saving the film", error, "the film is still in this job");
  }
}
