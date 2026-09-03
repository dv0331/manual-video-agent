import { readFile } from "node:fs/promises";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, IngestResult } from "@/lib/agent/types";

export async function understandManual(
  provider: MediaProvider,
  ingest: IngestResult,
): Promise<AssemblyGraph> {
  const images = [];
  for (const file of ingest.pageImages.slice(0, 6)) {
    images.push({
      mimeType: "image/png",
      base64: (await readFile(file)).toString("base64"),
    });
  }
  return provider.understand({ text: ingest.text, images });
}
