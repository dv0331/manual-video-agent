"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, FileUp, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function UploadPanel() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<"upload" | "sample" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

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

  async function onSample() {
    setError(null);
    setBusy("sample");
    try {
      await createJob({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "sample" }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the sample job");
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>Drop an instruction manual</CardTitle>
          <CardDescription>
            PDF or page images. The agent reads the first coherent procedure, up
            to eight scenes, and builds a chaptered assembly video from the
            figures in the source.
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
            The agent will not invent fasteners, torque, or tools. If a step
            has no figure, it says so instead of drawing extra hardware.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80">
        <div className="aspect-16/9 bg-[url('/sample-manual/fig-01.png')] bg-cover bg-center" />
        <CardHeader>
          <CardTitle>Try the AP-1 arbor press</CardTitle>
          <CardDescription>
            Six illustrated steps, two safety warnings, and real torque values
            from an original kit manual. No upload required.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={() => void onSample()} disabled={busy !== null}>
            {busy === "sample" ? <LoaderCircle className="animate-spin" /> : null}
            Generate sample video
          </Button>
          <a
            href="/sample-manual/AP-1-ASM-001.pdf"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Open the sample PDF
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
