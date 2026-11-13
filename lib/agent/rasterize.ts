import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

export function pdfPageCount(pdfPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("pdfinfo", [pdfPath], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", () => resolve(0));
    child.on("close", () => resolve(Number(out.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0)));
  });
}

/** Each page's text layer; pdftotext ends every page with a form feed. */
export function pdfPageTexts(pdfPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("pdftotext", ["-enc", "UTF-8", pdfPath, "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-800);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `pdftotext exited ${code}`));
      const pages = Buffer.concat(chunks).toString("utf8").split("\f");
      if (!pages.at(-1)?.trim()) pages.pop();
      resolve(pages.map((page) => page.trim()));
    });
  });
}

/** Render pages 1..maxPages to JPEG, long side 1400 px. */
export async function rasterizePdf(pdfPath: string, destDir: string, maxPages = 32): Promise<string[]> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pdftoppm",
      [
        "-jpeg",
        "-jpegopt",
        "quality=92",
        "-scale-to",
        "1400",
        "-f",
        "1",
        "-l",
        String(maxPages),
        pdfPath,
        path.join(destDir, "page"),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("pdftoppm timed out after 120s"));
    }, 120_000);
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-800) || `pdf rasterize exited ${code}`));
    });
  });
  const names = (await readdir(destDir)).filter((name) => /^page-\d+\.(jpg|png)$/.test(name)).sort();
  if (!names.length) throw new Error("pdftoppm produced no pages");
  return names.map((name) => path.join(destDir, name));
}
