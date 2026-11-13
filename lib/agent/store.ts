import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, jobDir } from "@/lib/agent/paths";
import type { AgentStage, Job, JobStatus } from "@/lib/agent/types";

const JOB_ID = /^[0-9a-f-]{36}$/i;

const queues = new Map<string, Promise<unknown>>();

/** Scenes finish concurrently; run each job's read-modify-write one at a time. */
function serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(fn);
  queues.set(id, next);
  void next
    .finally(() => {
      if (queues.get(id) === next) queues.delete(id);
    })
    .catch(() => undefined);
  return next;
}

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
  const tmp = path.join(dir, `job.json.${randomUUID()}.tmp`);
  await writeFile(tmp, JSON.stringify(job, null, 2));
  await rename(tmp, path.join(dir, "job.json"));
}

export function updateJob(id: string, patch: Partial<Job> & { log?: string }): Promise<Job> {
  return serial(id, async () => {
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
  });
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

export async function listJobs(limit = 12): Promise<Job[]> {
  try {
    const names = await readdir(DATA_DIR);
    const jobs = (
      await Promise.all(names.filter((name) => JOB_ID.test(name)).map((id) => loadJob(id)))
    ).filter((job): job is Job => Boolean(job));
    return jobs
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function failJob(id: string, error: string): Promise<Job> {
  return updateJob(id, {
    status: "failed" satisfies JobStatus,
    error,
    stageLabel: "Stopped",
    log: error,
  });
}
