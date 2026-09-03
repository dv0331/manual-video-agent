"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AssemblyPlayer } from "@/components/assembly-player";
import { Storyboard } from "@/components/storyboard";
import type { SerializedJob } from "@/lib/agent/serialize";

export function JobView({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<SerializedJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = (await response.json()) as SerializedJob & { error?: string };
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
      const data = (await response.json()) as SerializedJob & { error?: string };
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
          <Badge variant="outline">{job.provider === "gemini" ? "Gemini" : "Demo"}</Badge>
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={job.progress} />
        <p className="font-mono text-xs text-muted-foreground">{job.progress}% complete</p>
      </div>

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
              The agent is reading the manual, planning scenes, and evaluating
              each frame before it stitches the video. This page updates as
              scenes pass.
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
