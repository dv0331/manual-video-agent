import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, jobDir } from "@/lib/agent/paths";
import { loadJob, updateJob } from "@/lib/agent/store";
import type {
  AssemblyGraph,
  Job,
  MediaProviderName,
  Scene,
  SceneResult,
} from "@/lib/agent/types";
import { SAMPLE_CARDS } from "@/lib/sample-manual/cards";

export const SAMPLE_FILMS_DIR = path.join(ROOT, "content", "sample-films");

export interface SampleFilmManifest {
  sampleId: string;
  sourceName: string;
  provider: MediaProviderName;
  graph: AssemblyGraph;
  scenes: Scene[];
  sceneResults: SceneResult[];
  videoPath: string;
  vttPath?: string;
  captionsPath?: string;
}

export function sampleFilmDir(sampleId: string) {
  return path.join(SAMPLE_FILMS_DIR, sampleId);
}

export function sampleFilmReady(sampleId: string) {
  const dir = sampleFilmDir(sampleId);
  return existsSync(path.join(dir, "output.mp4")) && existsSync(path.join(dir, "film.json"));
}

export function shouldUseSampleFilm(sampleId?: string) {
  return Boolean(
    sampleId && sampleFilmReady(sampleId) && process.env.SAMPLE_FILM_REGEN !== "1",
  );
}

export function listReadySampleFilms() {
  return SAMPLE_CARDS.filter((card) => sampleFilmReady(card.id)).map((card) => card.id);
}

function relativize(base: string, filePath?: string) {
  if (!filePath) return undefined;
  const rel = path.isAbsolute(filePath) ? path.relative(base, filePath) : filePath;
  if (rel.startsWith("..")) return undefined;
  return rel.replaceAll("\\", "/");
}

function absolutize(base: string, filePath?: string) {
  if (!filePath) return undefined;
  return path.isAbsolute(filePath) ? filePath : path.join(base, filePath);
}

async function copyIfPresent(from: string, to: string) {
  if (!existsSync(from)) return false;
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  return true;
}

export async function loadSampleFilm(sampleId: string): Promise<SampleFilmManifest | null> {
  if (!sampleFilmReady(sampleId)) return null;
  const raw = await readFile(path.join(sampleFilmDir(sampleId), "film.json"), "utf8");
  return JSON.parse(raw) as SampleFilmManifest;
}

export function featuredFromSampleFilm() {
  const preferred = ["kallax", "ap-1", "bekvam", "lack"].find((id) => sampleFilmReady(id));
  if (!preferred) return null;
  const dir = sampleFilmDir(preferred);
  let scenes: Array<{ title: string; narration: string }> = [];
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(dir, "film.json"), "utf8"),
    ) as SampleFilmManifest;
    scenes = (manifest.scenes ?? []).map((scene) => ({
      title: scene.title,
      narration: scene.narration,
    }));
    return {
      sourceName: manifest.sourceName,
      videoUrl: `/api/sample-films/${preferred}/assets/output.mp4`,
      scenes,
    };
  } catch {
    return {
      sourceName: SAMPLE_CARDS.find((card) => card.id === preferred)?.title ?? preferred,
      videoUrl: `/api/sample-films/${preferred}/assets/output.mp4`,
      scenes,
    };
  }
}

export async function saveSampleFilm(jobId: string, sampleId: string) {
  const job = await loadJob(jobId);
  if (!job?.videoPath || !existsSync(job.videoPath)) {
    throw new Error(`Job ${jobId} has no finished film to save`);
  }
  const src = jobDir(jobId);
  const dest = sampleFilmDir(sampleId);
  await mkdir(path.join(dest, "frames"), { recursive: true });
  await mkdir(path.join(dest, "clips"), { recursive: true });

  await copyIfPresent(path.join(src, "output.mp4"), path.join(dest, "output.mp4"));
  for (const name of ["captions.vtt", "chapters.vtt", "storyboard.json", "evaluation.json"]) {
    await copyIfPresent(path.join(src, name), path.join(dest, name));
  }

  const sceneResults: SceneResult[] = [];
  for (const result of job.sceneResults ?? []) {
    const frameRel =
      relativize(src, result.framePath) ?? `frames/${result.scene.id}.png`;
    const clipRel = relativize(src, result.clipPath) ?? `clips/${result.scene.id}.mp4`;
    await copyIfPresent(result.framePath, path.join(dest, frameRel));
    await copyIfPresent(result.clipPath, path.join(dest, clipRel));
    sceneResults.push({
      ...result,
      framePath: frameRel,
      clipPath: clipRel,
      scene: { ...result.scene, figurePath: undefined },
    });
  }

  const manifest: SampleFilmManifest = {
    sampleId,
    sourceName: job.sourceName,
    provider: job.provider,
    graph: job.graph as AssemblyGraph,
    scenes: (job.scenes ?? []).map((scene) => ({ ...scene, figurePath: undefined })),
    sceneResults,
    videoPath: "output.mp4",
    vttPath: existsSync(path.join(dest, "chapters.vtt")) ? "chapters.vtt" : undefined,
    captionsPath: existsSync(path.join(dest, "captions.vtt")) ? "captions.vtt" : undefined,
  };
  await writeFile(path.join(dest, "film.json"), JSON.stringify(manifest, null, 2));
  return dest;
}

export async function hydrateSampleFilm(jobId: string, sampleId: string): Promise<Job> {
  const manifest = await loadSampleFilm(sampleId);
  if (!manifest) {
    throw new Error(`No pre-cut film for sample ${sampleId}`);
  }
  const src = sampleFilmDir(sampleId);
  const dest = jobDir(jobId);
  await mkdir(path.join(dest, "frames"), { recursive: true });
  await mkdir(path.join(dest, "clips"), { recursive: true });

  await copyIfPresent(path.join(src, "output.mp4"), path.join(dest, "output.mp4"));
  for (const name of ["captions.vtt", "chapters.vtt", "storyboard.json", "evaluation.json"]) {
    await copyIfPresent(path.join(src, name), path.join(dest, name));
  }

  const sceneResults: SceneResult[] = [];
  for (const result of manifest.sceneResults) {
    const frameRel = relativize(src, result.framePath) ?? result.framePath;
    const clipRel = relativize(src, result.clipPath) ?? result.clipPath;
    await copyIfPresent(path.join(src, frameRel), path.join(dest, frameRel));
    await copyIfPresent(path.join(src, clipRel), path.join(dest, clipRel));
    sceneResults.push({
      ...result,
      framePath: absolutize(dest, frameRel) as string,
      clipPath: absolutize(dest, clipRel) as string,
      scene: { ...result.scene, figurePath: undefined },
    });
  }

  return updateJob(jobId, {
    status: "completed",
    stage: "done",
    stageLabel: "Assembly video ready",
    progress: 100,
    provider: manifest.provider,
    graph: manifest.graph,
    scenes: manifest.scenes,
    sceneResults,
    videoPath: path.join(dest, "output.mp4"),
    vttPath: manifest.vttPath ? path.join(dest, manifest.vttPath) : undefined,
    captionsPath: manifest.captionsPath ? path.join(dest, manifest.captionsPath) : undefined,
    error: undefined,
    log: "Loaded the pre-cut sample film",
  });
}
