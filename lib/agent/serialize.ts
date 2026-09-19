import path from "node:path";
import { assetUrl, jobDir } from "@/lib/agent/paths";
import type { Job, SceneResult } from "@/lib/agent/types";

function toAsset(jobId: string, filePath?: string) {
  if (!filePath) return undefined;
  const rel = path.relative(jobDir(jobId), filePath);
  if (rel.startsWith("..")) return undefined;
  return assetUrl(jobId, rel);
}

export function serializeJob(job: Job) {
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
    scenes: job.scenes?.map((scene, i) => ({
      ...scene,
      figurePath: undefined,
      durationSeconds: job.sceneResults?.[i]?.durationSeconds ?? scene.durationSeconds,
    })),
    logs: job.logs,
    videoUrl: toAsset(job.id, job.videoPath),
    vttUrl: toAsset(job.id, job.vttPath),
    sceneResults: job.sceneResults?.map((result) => serializeResult(job.id, result)),
  };
}

function serializeResult(jobId: string, result: SceneResult) {
  return {
    ...result,
    frameUrl: toAsset(jobId, result.framePath),
    clipUrl: toAsset(jobId, result.clipPath),
    framePath: undefined,
    clipPath: undefined,
  };
}

export type SerializedJob = ReturnType<typeof serializeJob>;
