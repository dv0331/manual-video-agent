import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

export async function rasterizePdf(pdfPath: string, destDir: string, maxPages = 12): Promise<string[]> {
  const script = path.join(process.cwd(), "scripts", "rasterize-pdf.py");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("python3", [script, pdfPath, destDir, String(maxPages)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-800) || `pdf rasterize exited ${code}`));
    });
  });
  const names = (await readdir(destDir))
    .filter((name) => name.endsWith(".png"))
    .sort();
  return names.map((name) => path.join(destDir, name));
}
