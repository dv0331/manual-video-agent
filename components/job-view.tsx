"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AssemblyPlayer } from "@/components/assembly-player";
import { ProductionReel } from "@/components/production-reel";
import { Storyboard } from "@/components/storyboard";
import type { SerializedJob } from "@/lib/agent/serialize";
import type { TraceHeartbeat, TraceLine } from "@/lib/agent/trace";

type JobPayload = SerializedJob & {
  traces?: TraceLine[];
  heartbeat?: TraceHeartbeat | null;
  stalled?: boolean;
};

function ageLabel(iso?: string) {
  if (!iso) return "unknown";
  const sec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(sec)) return "unknown";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)} min ago`;
}

export function JobView({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = (await response.json()) as JobPayload & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Job not found");
        }
        if (!cancelled) {
          setJob(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the job");
        }
      }
    }
    void tick();
    const timer = setInterval(() => {
      if (job?.status === "completed" || job?.status === "failed") return;
      void tick();
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, job?.status]);

  async function retry() {
    setRetrying(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
      const data = (await response.json()) as JobPayload & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Retry failed");
      setJob(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  if (error && !job) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Job unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted"
        >
          Back to upload
        </Link>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-10 sm:px-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="mt-6 aspect-video animate-pulse rounded-xl bg-muted" />
        <p className="text-sm text-muted-foreground">Loading job {jobId}…</p>
      </main>
    );
  }

  const running = job.status === "running" || job.status === "queued";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-primary">
            JOB {job.id.slice(0, 8)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{job.sourceName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{job.stageLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>
            {job.status}
          </Badge>
          <Badge variant="outline">
            {job.provider === "openai"
              ? "OpenAI"
              : job.provider === "gemini"
                ? "Gemini"
                : "Demo"}
          </Badge>
        </div>
      </div>

      <ProductionReel job={job} />

      <div className="space-y-2">
        <Progress value={job.progress} />
        <p className="font-mono text-xs text-muted-foreground">
          {job.progress}% · {job.stageLabel}
          {job.heartbeat
            ? ` — ${job.heartbeat.step} (${job.heartbeat.elapsedSec}s on this step, beat ${ageLabel(job.heartbeat.at)})`
            : ""}
          {job.progress >= 60 && job.progress < 90 && !job.heartbeat
            ? " — mid-reel, not the credits"
            : ""}
        </p>
      </div>

      {job.stalled ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Worker stopped</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              No trace for {ageLabel(job.heartbeat?.at ?? job.traces?.at(-1)?.at ?? job.updatedAt)}.
              The bar stays at {job.progress}% because the process died after the last update
              {job.traces?.length ? `: ${job.traces.at(-1)?.message}` : `: ${job.stageLabel}`}.
            </span>
            <button
              type="button"
              onClick={() => void retry()}
              disabled={retrying}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
            >
              {retrying ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Retry
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      {job.traces?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live trace</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="max-h-64 space-y-1 overflow-auto font-mono text-xs text-muted-foreground">
              {job.traces.map((line) => (
                <li key={line.at + line.message}>
                  <span className="text-foreground/70">{line.at.slice(11, 19)}</span> {line.message}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {job.status === "failed" ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>The agent stopped</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{job.error}</span>
            <button
              type="button"
              onClick={() => void retry()}
              disabled={retrying}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
            >
              {retrying ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Retry
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      {job.videoUrl ? (
        <AssemblyPlayer
          videoUrl={job.videoUrl}
          vttUrl={job.vttUrl}
          captionsUrl={job.captionsUrl}
          scenes={job.scenes ?? []}
        />
      ) : running ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LoaderCircle className="size-4 animate-spin text-primary" />
              Building the assembly video
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              One scene at a time: still, motion, spoken line, judge. This
              page updates as each take passes. Minutes per scene is expected.
            </p>
            {job.graph ? (
              <p>
                Procedure: <span className="text-foreground">{job.graph.title}</span>
                {job.graph.steps?.length
                  ? ` · ${job.graph.steps.length} steps`
                  : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {job.sceneResults?.length ? <Storyboard results={job.sceneResults} /> : null}

      {job.graph ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assembly graph</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Parts
              </p>
              <ul className="space-y-1 text-sm">
                {job.graph.parts.length ? (
                  job.graph.parts.map((part) => (
                    <li key={part.id} className="flex justify-between gap-4">
                      <span>
                        <span className="font-mono text-primary">{part.id}</span>{" "}
                        {part.name}
                      </span>
                      <span className="text-muted-foreground">×{part.qty}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground">No BOM extracted.</li>
                )}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tools and notes
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {job.graph.tools.map((tool) => (
                  <li key={tool}>{tool}</li>
                ))}
                {job.graph.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
                {!job.graph.tools.length && !job.graph.notes.length ? (
                  <li>No tools listed in the extracted procedure.</li>
                ) : null}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {job.logs.length ? (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {job.status === "completed" ? (
              <CheckCircle2 className="size-3.5 text-primary" />
            ) : null}
            Agent log
          </p>
          <ol className="space-y-1 font-mono text-xs text-muted-foreground">
            {job.logs.slice(-10).map((log) => (
              <li key={log.at + log.message}>{log.message}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </main>
  );
}
