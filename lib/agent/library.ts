import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT, jobDir } from "@/lib/agent/paths";
import { loadJob, updateJob } from "@/lib/agent/store";
import type { AssemblyGraph, Job, MediaProviderName, Scene, SceneResult } from "@/lib/agent/types";

/** Films committed with the app; they survive every deploy and restart. */
export const BAKED_FILMS_DIR = path.join(ROOT, "content", "films");
/** Films saved at runtime. Point this at a persistent disk in production. */
export const LIBRARY_DIR = process.env.FILM_LIBRARY_DIR || path.join(ROOT, "data", "library");

const FILM_ID = /^[0-9a-f]{16}$/;

export function hashSource(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function filmIdFor(hash: string) {
  return hash.slice(0, 16);
}

export interface FilmManifest {
  id: string;
  sourceHash: string;
  sourceName: string;
  title: string;
  createdAt: string;
  provider: MediaProviderName;
  graph?: AssemblyGraph;
  scenes: Scene[];
  sceneResults: SceneResult[];
  videoPath: string;
  vttPath?: string;
  captionsPath?: string;
  sourcePath?: string;
  durationSeconds: number;
  timings?: Job["timings"];
}

export interface FilmSummary {
  id: string;
  title: string;
  sourceName: string;
  createdAt: string;
  durationSeconds: number;
  scenes: number;
  thumbUrl?: string;
  baked: boolean;
}

export function findFilmDir(id: string) {
  if (!FILM_ID.test(id)) return null;
  for (const root of [LIBRARY_DIR, BAKED_FILMS_DIR]) {
    const dir = path.join(root, id);
    if (existsSync(path.join(dir, "film.json")) && existsSync(path.join(dir, "output.mp4"))) return dir;
  }
  return null;
}

export async function loadFilm(id: string) {
  const dir = findFilmDir(id);
  if (!dir) return null;
  const manifest = JSON.parse(await readFile(path.join(dir, "film.json"), "utf8")) as FilmManifest;
  return { dir, manifest };
}

export function filmAssetUrl(id: string, rel: string) {
  return `/api/films/${id}/assets/${rel.split(path.sep).join("/")}`;
}

export async function listFilms(): Promise<FilmSummary[]> {
  const seen = new Map<string, FilmSummary>();
  for (const [root, baked] of [
    [LIBRARY_DIR, false],
    [BAKED_FILMS_DIR, true],
  ] as const) {
    let names: string[] = [];
    try {
      names = await readdir(/* turbopackIgnore: true */ root);
    } catch {
      continue;
    }
    for (const id of names) {
      if (!FILM_ID.test(id) || seen.has(id)) continue;
      try {
        const film = await loadFilm(id);
        if (!film) continue;
        const thumb = film.manifest.sceneResults.find((r) => r.framePath)?.framePath;
        seen.set(id, {
          id,
          title: film.manifest.title,
          sourceName: film.manifest.sourceName,
          createdAt: film.manifest.createdAt,
          durationSeconds: film.manifest.durationSeconds,
          scenes: film.manifest.scenes.length,
          thumbUrl: thumb ? filmAssetUrl(id, thumb) : undefined,
          baked,
        });
      } catch {
        // Skip a half-written film.
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function copyIfPresent(from: string | undefined, to: string) {
  if (!from || !existsSync(from)) return false;
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  return true;
}

async function saveJpeg(from: string | undefined, to: string, width: number) {
  if (!from || !existsSync(from)) return false;
  await mkdir(path.dirname(to), { recursive: true });
  await sharp(from)
    .flatten({ background: "#ffffff" })
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(to);
  return true;
}

/** Copy a finished job into the library so it can be reopened without rendering. */
export async function saveJobFilm(jobId: string) {
  const job = await loadJob(jobId);
  if (!job?.videoPath || !existsSync(job.videoPath) || !job.sourceHash) return null;
  const id = filmIdFor(job.sourceHash);
  const dest = path.join(LIBRARY_DIR, id);
  const src = jobDir(jobId);
  await mkdir(dest, { recursive: true });

  await copyIfPresent(job.videoPath, path.join(dest, "output.mp4"));
  const vtt = (await copyIfPresent(job.vttPath, path.join(dest, "chapters.vtt"))) ? "chapters.vtt" : undefined;
  const captions = (await copyIfPresent(job.captionsPath, path.join(dest, "captions.vtt")))
    ? "captions.vtt"
    : undefined;
  const source = (await copyIfPresent(path.join(src, "source.pdf"), path.join(dest, "source.pdf")))
    ? "source.pdf"
    : undefined;

  const sceneResults: SceneResult[] = [];
  for (const result of job.sceneResults ?? []) {
    const frameRel = `frames/${result.scene.id}.jpg`;
    const refRel = `refs/${result.scene.id}.jpg`;
    const hasFrame = await saveJpeg(result.framePath, path.join(dest, frameRel), 1280);
    const hasRef = await saveJpeg(result.referencePath, path.join(dest, refRel), 640);
    sceneResults.push({
      ...result,
      framePath: hasFrame ? frameRel : "",
      referencePath: hasRef ? refRel : undefined,
      clipPath: "",
      stillPath: undefined,
      scene: { ...result.scene, figurePath: undefined },
    });
  }

  const manifest: FilmManifest = {
    id,
    sourceHash: job.sourceHash,
    sourceName: job.sourceName,
    title: job.graph?.title || job.sourceName,
    createdAt: job.updatedAt,
    provider: job.provider,
    graph: job.graph,
    scenes: (job.scenes ?? []).map((scene) => ({ ...scene, figurePath: undefined })),
    sceneResults,
    videoPath: "output.mp4",
    vttPath: vtt,
    captionsPath: captions,
    sourcePath: source,
    durationSeconds: sceneResults.reduce((sum, r) => sum + r.durationSeconds, 0),
    timings: job.timings,
  };
  await writeFile(path.join(dest, "film.json"), JSON.stringify(manifest, null, 2));
  return id;
}

/** Point a job at a saved film; nothing is copied. */
export async function openFilmInJob(jobId: string, filmId: string, note: string) {
  const film = await loadFilm(filmId);
  if (!film) throw new Error(`No saved film ${filmId}`);
  const { dir, manifest } = film;
  const abs = (rel?: string) => (rel ? path.join(/* turbopackIgnore: true */ dir, rel) : undefined);
  return updateJob(jobId, {
    status: "completed",
    stage: "done",
    stageLabel: "Assembly video ready",
    progress: 100,
    provider: manifest.provider,
    graph: manifest.graph,
    scenes: manifest.scenes,
    sceneResults: manifest.sceneResults.map((result) => ({
      ...result,
      framePath: abs(result.framePath) ?? "",
      referencePath: abs(result.referencePath),
      clipPath: "",
    })),
    videoPath: path.join(/* turbopackIgnore: true */ dir, manifest.videoPath),
    vttPath: abs(manifest.vttPath),
    captionsPath: abs(manifest.captionsPath),
    sourceHash: manifest.sourceHash,
    filmId,
    timings: manifest.timings,
    error: undefined,
    log: note,
  });
}
