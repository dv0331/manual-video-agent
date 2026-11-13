import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { findFilmDir } from "@/lib/agent/library";
import { jobDir } from "@/lib/agent/paths";
import { startJob } from "@/lib/agent/run";
import { serializeJob } from "@/lib/agent/serialize";
import { loadJob, updateJob } from "@/lib/agent/store";
import { hydrateSampleFilm, shouldUseSampleFilm } from "@/lib/sample-manual/films";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = await loadJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  if (!fresh && shouldUseSampleFilm(job.sampleId)) {
    const ready = await hydrateSampleFilm(id, job.sampleId as string);
    return NextResponse.json(serializeJob(ready));
  }

  const filmDir = job.filmId ? findFilmDir(job.filmId) : null;
  const source = path.join(jobDir(id), "source.pdf");
  if (filmDir && !existsSync(source) && existsSync(path.join(filmDir, "source.pdf"))) {
    await copyFile(path.join(filmDir, "source.pdf"), source);
  }

  const next = await updateJob(id, {
    status: "queued",
    stage: "queued",
    stageLabel: fresh ? "Making a fresh cut" : "Retrying",
    progress: 0,
    error: undefined,
    sceneResults: [],
    videoPath: undefined,
    vttPath: undefined,
    captionsPath: undefined,
    filmId: undefined,
    timings: undefined,
    log: fresh ? "Fresh cut requested" : "Retry requested",
  });
  startJob(id, undefined, { fresh });
  return NextResponse.json(serializeJob(next));
}
