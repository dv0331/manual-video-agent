import { NextResponse } from "next/server";
import { serializeJob } from "@/lib/agent/serialize";
import { loadJob } from "@/lib/agent/store";

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
  return NextResponse.json(serializeJob(job));
}
