import { NextResponse } from "next/server";
import { startJob } from "@/lib/agent/run";
import { serializeJob } from "@/lib/agent/serialize";
import { loadJob, updateJob } from "@/lib/agent/store";
import { hydrateSampleFilm, shouldUseSampleFilm } from "@/lib/sample-manual/films";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await loadJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (shouldUseSampleFilm(job.sampleId)) {
    const ready = await hydrateSampleFilm(id, job.sampleId as string);
    return NextResponse.json(serializeJob(ready));
  }
  const next = await updateJob(id, {
    status: "queued",
    stage: "queued",
    stageLabel: "Retrying",
    progress: 0,
    error: undefined,
    sceneResults: [],
    videoPath: undefined,
    log: "Retry requested",
  });
  startJob(id);
  return NextResponse.json(serializeJob(next));
}
