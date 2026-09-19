import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const JOBS = path.join(ROOT, "data", "jobs");
const FILMS = path.join(ROOT, "content", "sample-films");

const SOURCES = {
  kallax: "0d79137d-c141-4148-b95b-df36d1ecac18",
  bekvam: "fda385c1-fe8c-4f65-9f21-636be09a5d96",
  "ap-1": "d2df167e-bd36-43fc-b3cf-becfc228a039",
  lack: "dd3adb4d-b8d7-43e4-af64-b37ecbe0dd18",
};

function rel(base, filePath) {
  if (!filePath) return undefined;
  const value = path.isAbsolute(filePath) ? path.relative(base, filePath) : filePath;
  if (value.startsWith("..")) return undefined;
  return value.replaceAll("\\", "/");
}

async function copyIfPresent(from, to) {
  if (!existsSync(from)) return false;
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  return true;
}

async function saveOne(sampleId, jobId) {
  const src = path.join(JOBS, jobId);
  const dest = path.join(FILMS, sampleId);
  const job = JSON.parse(await readFile(path.join(src, "job.json"), "utf8"));
  if (!existsSync(path.join(src, "output.mp4"))) {
    throw new Error(`${sampleId}: ${jobId} has no output.mp4`);
  }
  await mkdir(path.join(dest, "frames"), { recursive: true });
  await mkdir(path.join(dest, "clips"), { recursive: true });
  await copyIfPresent(path.join(src, "output.mp4"), path.join(dest, "output.mp4"));
  for (const name of ["captions.vtt", "chapters.vtt", "storyboard.json", "evaluation.json"]) {
    await copyIfPresent(path.join(src, name), path.join(dest, name));
  }
  const sceneResults = [];
  for (const result of job.sceneResults ?? []) {
    const frameRel = rel(src, result.framePath) ?? `frames/${result.scene.id}.png`;
    const clipRel = rel(src, result.clipPath) ?? `clips/${result.scene.id}.mp4`;
    await copyIfPresent(result.framePath, path.join(dest, frameRel));
    await copyIfPresent(result.clipPath, path.join(dest, clipRel));
    sceneResults.push({
      ...result,
      framePath: frameRel,
      clipPath: clipRel,
      scene: { ...result.scene, figurePath: undefined },
    });
  }
  const manifest = {
    sampleId,
    sourceName: job.sourceName,
    provider: job.provider,
    graph: job.graph,
    scenes: (job.scenes ?? []).map((scene) => ({ ...scene, figurePath: undefined })),
    sceneResults,
    videoPath: "output.mp4",
    vttPath: existsSync(path.join(dest, "chapters.vtt")) ? "chapters.vtt" : undefined,
    captionsPath: existsSync(path.join(dest, "captions.vtt")) ? "captions.vtt" : undefined,
  };
  await writeFile(path.join(dest, "film.json"), JSON.stringify(manifest, null, 2));
  const size = (await readFile(path.join(dest, "output.mp4"))).length;
  console.log(`saved ${sampleId} from ${jobId} (${size} bytes, ${sceneResults.length} scenes)`);
}

const extra = process.argv.slice(2);
const map = { ...SOURCES };
for (let i = 0; i < extra.length; i += 2) {
  if (extra[i] && extra[i + 1]) map[extra[i]] = extra[i + 1];
}

for (const [sampleId, jobId] of Object.entries(map)) {
  await saveOne(sampleId, jobId);
}
