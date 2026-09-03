import sharp from "sharp";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, IngestResult } from "@/lib/agent/types";

export async function understandManual(
  provider: MediaProvider,
  ingest: IngestResult,
): Promise<AssemblyGraph> {
  const images = [];
  for (const file of ingest.pageImages.slice(0, 2)) {
    const compressed = await sharp(file)
      .resize({ width: 720, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    images.push({
      mimeType: "image/png",
      base64: compressed.toString("base64"),
    });
  }
  return provider.understand({ text: ingest.text, images });
}
