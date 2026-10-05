import { NextResponse } from "next/server";
import { jobDir } from "@/lib/agent/paths";
import { serializeJob } from "@/lib/agent/serialize";
import { loadJob } from "@/lib/agent/store";
import { isStalled, readHeartbeat, readTraces } from "@/lib/agent/trace";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await loadJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const dir = jobDir(id);
  const [traces, heartbeat] = await Promise.all([readTraces(dir), readHeartbeat(dir)]);
  return NextResponse.json({
    ...serializeJob(job),
    traces,
    heartbeat,
    stalled: isStalled(job.status, job.updatedAt, traces, heartbeat),
  });
}
