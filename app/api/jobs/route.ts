import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { after } from "next/server";
import { NextResponse } from "next/server";
import { jobDir } from "@/lib/agent/paths";
import { resolveProviderName } from "@/lib/agent/providers";
import { startJob } from "@/lib/agent/run";
import { serializeJob } from "@/lib/agent/serialize";
import { createJob, listJobs } from "@/lib/agent/store";
import { getSample } from "@/lib/sample-manual/catalog";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json(
    jobs.map((job) => ({
      id: job.id,
      createdAt: job.createdAt,
      status: job.status,
      stageLabel: job.stageLabel,
      progress: job.progress,
      sourceName: job.sourceName,
      provider: job.provider,
    })),
  );
}

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { source?: string; sampleId?: string };
    if (body.source !== "sample") {
      return NextResponse.json({ error: "Unknown source" }, { status: 400 });
    }
    const sample = getSample(body.sampleId);
    const job = await createJob({
      id,
      createdAt,
      status: "queued",
      stage: "queued",
      stageLabel: "Queued",
      progress: 0,
      sourceName: sample.title,
      sourceKind: "sample",
      sampleId: sample.id,
      provider: resolveProviderName(),
    });
    after(() => {
      startJob(id);
    });
    return NextResponse.json(serializeJob(job));
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a PDF or image" }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 20 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const job = await createJob({
    id,
    createdAt,
    status: "queued",
    stage: "queued",
    stageLabel: "Queued",
    progress: 0,
    sourceName: file.name,
    sourceKind: "upload",
    provider: resolveProviderName(),
  });
  const ext = mimeType.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")
    ? ".pdf"
    : ".png";
  await mkdir(jobDir(id), { recursive: true });
  await writeFile(path.join(jobDir(id), `source${ext}`), buffer);
  await writeFile(
    path.join(jobDir(id), "upload.json"),
    JSON.stringify({ name: file.name, mimeType }),
  );

  after(() => {
    startJob(id, {
      name: file.name,
      buffer,
      mimeType,
    });
  });
  return NextResponse.json(serializeJob(job));
}
