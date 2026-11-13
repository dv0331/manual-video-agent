import sharp from "sharp";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, IngestResult } from "@/lib/agent/types";
import { getSample } from "@/lib/sample-manual/catalog";

export async function understandManual(
  provider: MediaProvider,
  ingest: IngestResult,
  sampleId?: string,
): Promise<AssemblyGraph> {
  if (sampleId) {
    return structuredClone(getSample(sampleId).graph);
  }

  const images = [];
  for (const file of ingest.pageImages.slice(0, 6)) {
    const compressed = await sharp(file)
      .flatten({ background: "#ffffff" })
      .resize({ width: 720, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    images.push({
      mimeType: "image/jpeg",
      base64: compressed.toString("base64"),
    });
  }
  return provider.understand({ text: ingest.text, images });
}
