import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { jobDir } from "@/lib/agent/paths";
import type { AgentStage, Job, JobStatus } from "@/lib/agent/types";

export async function createJob(partial: Omit<Job, "logs" | "updatedAt"> & { logs?: Job["logs"] }): Promise<Job> {
  const job: Job = {
    ...partial,
    updatedAt: partial.createdAt,
    logs: partial.logs ?? [],
  };
  await mkdir(jobDir(job.id), { recursive: true });
  await saveJob(job);
  return job;
}

export async function loadJob(id: string): Promise<Job | null> {
  try {
    const raw = await readFile(path.join(jobDir(id), "job.json"), "utf8");
    return JSON.parse(raw) as Job;
  } catch {
    return null;
  }
}

export async function saveJob(job: Job): Promise<void> {
  job.updatedAt = new Date().toISOString();
  const dir = jobDir(job.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "job.json"), JSON.stringify(job, null, 2));
}

export async function updateJob(
  id: string,
  patch: Partial<Job> & { log?: string },
): Promise<Job> {
  const job = await loadJob(id);
  if (!job) {
    throw new Error(`Job ${id} not found`);
  }
  const next: Job = { ...job, ...patch, logs: [...job.logs] };
  if (patch.log) {
    next.logs.push({ at: new Date().toISOString(), message: patch.log });
  }
  await saveJob(next);
  return next;
}

export async function setStage(
  id: string,
  stage: AgentStage,
  stageLabel: string,
  progress: number,
  extra?: Partial<Job>,
): Promise<Job> {
  return updateJob(id, {
    status: "running",
    stage,
    stageLabel,
    progress,
    log: stageLabel,
    ...extra,
  });
}

export async function failJob(id: string, error: string): Promise<Job> {
  return updateJob(id, {
    status: "failed" satisfies JobStatus,
    error,
    stageLabel: "Stopped",
    log: error,
  });
}
