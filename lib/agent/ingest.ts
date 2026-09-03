import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SAMPLE_MANUAL_TEXT } from "@/lib/sample-manual/graph";
import type { IngestResult } from "@/lib/agent/types";

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

async function extractPdf(buffer: Buffer): Promise<{ text: string; pageTexts: string[] }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(result.text) ? result.text : [result.text];
  return { text: pageTexts.join("\n\n"), pageTexts };
}

export async function ingestSource(options: {
  jobPath: string;
  kind: "sample" | "upload";
  file?: { name: string; buffer: Buffer; mimeType: string };
}): Promise<IngestResult> {
  const pagesDir = path.join(options.jobPath, "pages");
  const figuresDir = path.join(options.jobPath, "figures");
  await mkdir(pagesDir, { recursive: true });
  await mkdir(figuresDir, { recursive: true });

  if (options.kind === "sample") {
    const sampleDir = path.join(process.cwd(), "content", "sample-manual");
    const figureNames = [
      "fig-01.png",
      "fig-02.png",
      "fig-03.png",
      "fig-04.png",
      "fig-05.png",
      "fig-06.png",
    ];
    const figureImages: string[] = [];
    const pageImages: string[] = [];
    for (const [i, name] of figureNames.entries()) {
      const destFig = path.join(figuresDir, name);
      const destPage = path.join(pagesDir, `page-${String(i + 1).padStart(3, "0")}.png`);
      await copyFile(path.join(sampleDir, "figures", name), destFig);
      await copyFile(path.join(sampleDir, "figures", name), destPage);
      figureImages.push(destFig);
      pageImages.push(destPage);
    }
    await copyFile(
      path.join(sampleDir, "AP-1-ASM-001.pdf"),
      path.join(options.jobPath, "source.pdf"),
    );
    return {
      pageImages,
      figureImages,
      text: SAMPLE_MANUAL_TEXT,
      pageTexts: SAMPLE_MANUAL_TEXT.split(/Step \d+/).map((s) => s.trim()),
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
    await sharp(options.file.buffer).png().toFile(dest);
    await copyFile(dest, path.join(figuresDir, "fig-01.png"));
    return {
      pageImages: [dest],
      figureImages: [path.join(figuresDir, "fig-01.png")],
      text: "",
      pageTexts: [],
    };
  }

  if (!isPdf) {
    throw new Error("Upload a PDF or an image of the instruction manual.");
  }

  await writeFile(path.join(options.jobPath, "source.pdf"), options.file.buffer);
  const extracted = await extractPdf(options.file.buffer);
  const pageImages: string[] = [];
  const figureImages: string[] = [];
  const pages = extracted.pageTexts.length ? extracted.pageTexts : [extracted.text];

  for (const [i, pageText] of pages.slice(0, 12).entries()) {
    const dest = path.join(pagesDir, `page-${String(i + 1).padStart(3, "0")}.png`);
    await renderTextPage(
      pageText || extracted.text,
      dest,
      `Manual page ${i + 1}`,
    );
    pageImages.push(dest);
    if (i < 8) {
      const fig = path.join(figuresDir, `fig-${String(i + 1).padStart(2, "0")}.png`);
      await copyFile(dest, fig);
      figureImages.push(fig);
    }
  }

  return {
    pageImages,
    figureImages,
    text: extracted.text,
    pageTexts: extracted.pageTexts,
  };
}
