import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

export async function rasterizePdf(pdfPath: string, destDir: string, maxPages = 12): Promise<string[]> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pdftoppm", [
      "-png",
      "-r",
      "110",
      "-f",
      "1",
      "-l",
      String(maxPages),
      pdfPath,
      path.join(destDir, "page"),
    ], {
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
  if (!names.length) throw new Error("pdftoppm produced no pages");
  return names.map((name) => path.join(destDir, name));
}
