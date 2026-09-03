import { demoProvider } from "@/lib/agent/providers/demo";
import { geminiProvider, hasGeminiKey } from "@/lib/agent/providers/gemini";
import type { MediaProvider } from "@/lib/agent/providers/types";

export function getMediaProvider(): MediaProvider {
  return hasGeminiKey() ? geminiProvider : demoProvider;
}

export { demoProvider, geminiProvider, hasGeminiKey };
