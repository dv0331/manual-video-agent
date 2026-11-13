import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { pdfPageCount, pdfPageTexts, rasterizePdf } from "@/lib/agent/rasterize";
import { trace, traceFailure } from "@/lib/agent/trace";
import type { IngestResult } from "@/lib/agent/types";
import { getSample } from "@/lib/sample-manual/catalog";

const MAX_PAGES = Number(process.env.MAX_PAGES ?? 32);

async function renderTextPage(text: string, dest: string, title: string) {
  const lines = text
    .split(/\n/)
    .map((line) => escapeXml(line.slice(0, 110)))
    .slice(0, 22);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
  <rect width="1600" height="900" fill="#efe6d4"/>
  <rect x="36" y="36" width="1528" height="828" fill="none" stroke="#1d2118" stroke-width="3"/>
  <rect x="36" y="36" width="1528" height="64" fill="#1d2118"/>
  <text x="60" y="78" font-family="DejaVu Sans, sans-serif" font-size="26" fill="#F2C14E" font-weight="700">${escapeXml(title)}</text>
  ${lines
    .map(
      (line, i) =>
        `<text x="64" y="${140 + i * 30}" font-family="DejaVu Sans, sans-serif" font-size="20" fill="#1d2118">${line}</text>`,
    )
    .join("\n")}
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(dest);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Poppler reads the text layer in a child process. pdf.js (the fallback) costs
 * about eight times the CPU and holds the event loop while it parses.
 */
async function extractPdf(pdfPath: string, buffer: Buffer): Promise<{ text: string; pageTexts: string[] }> {
  let pageTexts: string[];
  try {
    pageTexts = await pdfPageTexts(pdfPath);
  } catch {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: false });
    pageTexts = Array.isArray(result.text) ? result.text : [result.text];
  }
  return { text: pageTexts.join("\n\n"), pageTexts };
}

async function copyPngDir(srcDir: string, destDir: string, prefix: string) {
  const names = (await readdir(srcDir))
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort();
  const dests: string[] = [];
  for (const [i, name] of names.entries()) {
    const dest = path.join(
      destDir,
      `${prefix}-${String(i + 1).padStart(prefix === "fig" ? 2 : 3, "0")}.png`,
    );
    await copyFile(path.join(srcDir, name), dest);
    dests.push(dest);
  }
  return dests;
}

export async function ingestSource(options: {
  jobPath: string;
  kind: "sample" | "upload";
  sampleId?: string;
  file?: { name: string; buffer: Buffer; mimeType: string };
}): Promise<IngestResult> {
  const pagesDir = path.join(options.jobPath, "pages");
  const figuresDir = path.join(options.jobPath, "figures");
  await mkdir(pagesDir, { recursive: true });
  await mkdir(figuresDir, { recursive: true });

  if (options.kind === "sample") {
    const sample = getSample(options.sampleId);
    const figureImages = sample.figuresDir
      ? await copyPngDir(sample.figuresDir, figuresDir, "fig")
      : [];
    const pageImages = sample.pagesDir
      ? await copyPngDir(sample.pagesDir, pagesDir, "page")
      : [];
    if (!pageImages.length && figureImages.length) {
      for (const [i, fig] of figureImages.entries()) {
        const dest = path.join(pagesDir, `page-${String(i + 1).padStart(3, "0")}.png`);
        await copyFile(fig, dest);
        pageImages.push(dest);
      }
    }
    if (!figureImages.length && pageImages.length) {
      for (const [i, page] of pageImages.slice(0, 8).entries()) {
        const dest = path.join(figuresDir, `fig-${String(i + 1).padStart(2, "0")}.png`);
        await copyFile(page, dest);
        figureImages.push(dest);
      }
    }
    await copyFile(sample.pdfPath, path.join(options.jobPath, "source.pdf"));
    return {
      pageImages,
      figureImages,
      text: sample.text,
      pageTexts: sample.graph.steps.map((step) => `Step ${step.index} — ${step.title}. ${step.instruction}`),
    };
  }

  if (!options.file) {
    throw new Error("No file uploaded");
  }

  const isPdf =
    options.file.mimeType.includes("pdf") ||
    options.file.name.toLowerCase().endsWith(".pdf");
  const isImage = options.file.mimeType.startsWith("image/");

  if (isImage) {
    const dest = path.join(pagesDir, "page-001.png");
    await sharp(options.file.buffer)
      .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
      .png()
      .toFile(dest);
    return {
      pageImages: [dest],
      figureImages: [],
      text: "",
      pageTexts: [],
    };
  }

  if (!isPdf) {
    throw new Error("Upload a PDF or an image of the instruction manual.");
  }

  const sourcePdf = path.join(options.jobPath, "source.pdf");
  await writeFile(sourcePdf, options.file.buffer);
  const [extracted, pageCount] = await Promise.all([
    extractPdf(sourcePdf, options.file.buffer).catch(async (error) => {
      await traceFailure("PDF text layer", error, "reading the drawings only");
      return { text: "", pageTexts: [] as string[] };
    }),
    pdfPageCount(sourcePdf),
  ]);
  let pageImages: string[] = [];
  if (pageCount > MAX_PAGES) {
    await trace(`Manual has ${pageCount} pages; reading the first ${MAX_PAGES}`);
  }

  try {
    pageImages = await rasterizePdf(sourcePdf, pagesDir, MAX_PAGES);
  } catch (error) {
    await traceFailure("PDF rasterize", error, "drawing text pages");
    const pages = extracted.pageTexts.length ? extracted.pageTexts : [extracted.text];
    for (const [i, pageText] of pages.slice(0, MAX_PAGES).entries()) {
      const dest = path.join(pagesDir, `page-${String(i + 1).padStart(3, "0")}.png`);
      await renderTextPage(pageText || extracted.text, dest, `Manual page ${i + 1}`);
      pageImages.push(dest);
    }
  }

  return {
    pageImages,
    figureImages: [],
    text: extracted.text,
    pageTexts: extracted.pageTexts,
  };
}
