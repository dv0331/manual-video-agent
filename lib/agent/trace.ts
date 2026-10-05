import { AsyncLocalStorage } from "node:async_hooks";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type TraceContext = { jobPath: string };

const storage = new AsyncLocalStorage<TraceContext>();

const steps = new Map<string, { step: string; started: number }>();

export type TraceLine = { at: string; message: string };
export type TraceHeartbeat = { at: string; step: string; elapsedSec: number };

export function withJobTrace<T>(jobPath: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ jobPath }, fn);
}

export function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.replace(/sk-[A-Za-z0-9*_\-]{6,}/g, "sk-…redacted");
  if (/incorrect api key/i.test(message)) {
    return "OpenAI rejected the API key. The request reached OpenAI; the key is not valid. Create a new one at platform.openai.com/api-keys.";
  }
  if (/api key has expired/i.test(message)) {
    return "OpenAI says this API key has expired. Create a new one at platform.openai.com/api-keys.";
  }
  return message;
}

async function writeTrace(jobPath: string, message: string) {
  const at = new Date().toISOString();
  console.log(`[trace] ${at} ${message}`);
  await appendFile(
    path.join(jobPath, "trace.jsonl"),
    `${JSON.stringify({ at, message })}\n`,
  ).catch(() => undefined);
}

export async function trace(message: string) {
  const ctx = storage.getStore();
  if (!ctx) {
    console.log(`[trace] ${new Date().toISOString()} ${message}`);
    return;
  }
  steps.set(ctx.jobPath, { step: message, started: Date.now() });
  await writeTrace(ctx.jobPath, message);
}

export async function traceFailure(scope: string, error: unknown, fallback: string) {
  const message = `${scope} failed: ${errorText(error)} — ${fallback}`;
  console.warn(message);
  await trace(message);
}

export function startTraceHeartbeat(jobPath: string) {
  if (!steps.has(jobPath)) {
    steps.set(jobPath, { step: "starting", started: Date.now() });
  }
  const timer = setInterval(() => {
    const current = steps.get(jobPath) ?? { step: "starting", started: Date.now() };
    const beat: TraceHeartbeat = {
      at: new Date().toISOString(),
      step: current.step,
      elapsedSec: Math.round((Date.now() - current.started) / 1000),
    };
    console.log(`[trace] ${beat.at} heartbeat · ${beat.step} · ${beat.elapsedSec}s`);
    void writeFile(path.join(jobPath, "heartbeat.json"), JSON.stringify(beat)).catch(
      () => undefined,
    );
  }, 15000);
  return () => {
    clearInterval(timer);
    steps.delete(jobPath);
  };
}

export async function readTraces(jobPath: string, limit = 40): Promise<TraceLine[]> {
  try {
    const raw = await readFile(path.join(jobPath, "trace.jsonl"), "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as TraceLine;
        } catch {
          return { at: "", message: line };
        }
      });
  } catch {
    return [];
  }
}

export async function readHeartbeat(jobPath: string): Promise<TraceHeartbeat | null> {
  try {
    return JSON.parse(await readFile(path.join(jobPath, "heartbeat.json"), "utf8")) as TraceHeartbeat;
  } catch {
    return null;
  }
}

export function isStalled(
  status: string,
  updatedAt: string,
  traces: TraceLine[],
  heartbeat: TraceHeartbeat | null,
  staleMs = 90_000,
) {
  if (status !== "running" && status !== "queued") return false;
  const last = heartbeat?.at || traces.at(-1)?.at || updatedAt;
  const age = Date.now() - Date.parse(last);
  return Number.isFinite(age) && age > staleMs;
}
