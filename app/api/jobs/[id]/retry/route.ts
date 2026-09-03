import { NextResponse } from "next/server";
import { startJob } from "@/lib/agent/run";
import { serializeJob } from "@/lib/agent/serialize";
import { loadJob, updateJob } from "@/lib/agent/store";

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
