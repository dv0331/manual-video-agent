"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, FileUp, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_CARDS } from "@/lib/sample-manual/cards";

export function UploadPanel() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [precut, setPrecut] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void fetch("/api/samples", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: Array<{ id?: string; precut?: boolean }>) => {
        const next: Record<string, boolean> = {};
        for (const row of rows) {
          if (row.id) next[row.id] = Boolean(row.precut);
        }
        setPrecut(next);
      })
      .catch(() => undefined);
  }, []);

  async function createJob(init: RequestInit) {
    const response = await fetch("/api/jobs", init);
    const data = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !data.id) {
      throw new Error(data.error ?? "Could not start the job");
    }
    router.push(`/jobs/${data.id}`);
  }

  async function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      await createJob({ method: "POST", body });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(null);
    }
  }

  async function onSample(sampleId: string) {
    setError(null);
    setBusy(sampleId);
    try {
      await createJob({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "sample", sampleId }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the sample job");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>Drop an instruction manual</CardTitle>
          <CardDescription>
            PDF or page images. The agent plans the reel, shoots a person at
            each step, speaks the line, judges the take, and returns the movie.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void onFile(file);
            }}
            className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition ${
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border bg-muted/30 hover:border-primary/50"
            }`}
          >
            <FileUp className="mb-3 size-8 text-primary" />
            <span className="text-sm font-medium">
              {fileName ?? "PDF, PNG, or JPG — 20 MB max"}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              Click to browse or drag the file onto this panel
            </span>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </label>
          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Could not start the job</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Each scene is one take: start frame, image-to-video, spoken line,
            then a judge. Audio fail retries the clip. Visual fail remakes the
            still. If motion models are down, the same still still moves.
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Sample manuals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Official IKEA assembly PDFs plus the original AP-1 kit. Each sample
            already has a finished cut — open it and the film plays immediately.
            Drop your own PDF above to shoot a new one.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {SAMPLE_CARDS.map((sample) => (
            <Card key={sample.id} className="overflow-hidden border-border/80">
              <div
                className="aspect-16/9 bg-muted bg-cover bg-center"
                style={{ backgroundImage: `url('${sample.thumb}')` }}
              />
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{sample.title}</CardTitle>
                <CardDescription>{sample.subtitle}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => void onSample(sample.id)}
                  disabled={busy !== null}
                  className="inline-flex min-h-11 min-w-44 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50"
                >
                  {busy === sample.id ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  {precut[sample.id] ? "Play the film" : "Generate video"}
                </button>
                <a
                  href={sample.pdfPublicPath}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the PDF
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          IKEA pages are sample inputs from published instructions and the IKEA
          3D Assembly Dataset. IKEA remains the rights holder.
        </p>
      </section>
    </div>
  );
}
