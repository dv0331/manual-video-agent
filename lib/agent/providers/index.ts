import { demoProvider } from "@/lib/agent/providers/demo";
import { geminiProvider, hasGeminiKey } from "@/lib/agent/providers/gemini";
import { hasOpenAIKey, openaiProvider } from "@/lib/agent/providers/openai";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { MediaProviderName } from "@/lib/agent/types";

export function resolveProviderName(): MediaProviderName {
  if (hasOpenAIKey()) return "openai";
  if (hasGeminiKey()) return "gemini";
  return "demo";
}

export function getMediaProvider(): MediaProvider {
  const name = resolveProviderName();
  if (name === "openai") return openaiProvider;
  if (name === "gemini") return geminiProvider;
  return demoProvider;
}

export { demoProvider, geminiProvider, hasGeminiKey, hasOpenAIKey, openaiProvider };
