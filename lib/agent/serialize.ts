import path from "node:path";
import { filmAssetUrl, findFilmDir } from "@/lib/agent/library";
import { assetUrl, jobDir } from "@/lib/agent/paths";
import type { Job, SceneResult } from "@/lib/agent/types";

function inside(root: string, filePath: string) {
  const rel = path.relative(root, filePath);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : null;
}

function assetResolver(job: Job) {
  const filmDir = job.filmId ? findFilmDir(job.filmId) : null;
  return (filePath?: string) => {
    if (!filePath) return undefined;
    const inJob = inside(jobDir(job.id), filePath);
    if (inJob) return assetUrl(job.id, inJob);
    const inFilm = filmDir && job.filmId ? inside(filmDir, filePath) : null;
    if (inFilm && job.filmId) return filmAssetUrl(job.filmId, inFilm);
    return undefined;
  };
}

export function serializeJob(job: Job) {
  const toAsset = assetResolver(job);
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    stage: job.stage,
    stageLabel: job.stageLabel,
    progress: job.progress,
    sourceName: job.sourceName,
    sourceKind: job.sourceKind,
    sampleId: job.sampleId,
    provider: job.provider,
    error: job.error,
    graph: job.graph,
    filmId: job.filmId,
    timings: job.timings,
    scenes: job.scenes?.map((scene, i) => ({
      ...scene,
      figurePath: undefined,
      durationSeconds: job.sceneResults?.[i]?.durationSeconds ?? scene.durationSeconds,
    })),
    logs: job.logs,
    videoUrl: toAsset(job.videoPath),
    vttUrl: toAsset(job.vttPath),
    captionsUrl: toAsset(job.captionsPath),
    sceneResults: job.sceneResults?.map((result) => serializeResult(result, toAsset)),
  };
}

function serializeResult(result: SceneResult, toAsset: (filePath?: string) => string | undefined) {
  return {
    ...result,
    scene: { ...result.scene, figurePath: undefined },
    frameUrl: toAsset(result.framePath),
    referenceUrl: toAsset(result.referencePath),
    clipUrl: toAsset(result.clipPath),
    framePath: undefined,
    referencePath: undefined,
    clipPath: undefined,
    stillPath: undefined,
  };
}

export type SerializedJob = ReturnType<typeof serializeJob>;
