import path from "node:path";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data", "jobs");
export const SAMPLE_DIR = path.join(ROOT, "content", "sample-manual");
export const FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
export const FONT_BOLD_PATH =
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

export function jobDir(id: string) {
  return path.join(DATA_DIR, id);
}

export function assetUrl(jobId: string, relPath: string) {
  return `/api/jobs/${jobId}/assets/${relPath.split(path.sep).join("/")}`;
}
