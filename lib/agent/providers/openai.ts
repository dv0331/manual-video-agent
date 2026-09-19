import { extractJson } from "@/lib/agent/json";
import { withTimeout } from "@/lib/agent/timeout";
import { MAX_SCENES, type AssemblyGraph, type EvaluationScores, type Scene } from "@/lib/agent/types";
import { demoProvider } from "@/lib/agent/providers/demo";
import type { ImageInput, MediaProvider } from "@/lib/agent/providers/types";

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5";

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function baseUrl() {
  return (process.env.OPENAI_BASE_URL ?? "https://us.api.openai.com/v1").replace(/\/$/, "");
}

async function openaiFetch(path: string, body: unknown, timeoutMs: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const response = await withTimeout(
    fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    timeoutMs,
    `OpenAI ${path}`,
  );
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const err = data.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `OpenAI ${path} failed (${response.status})`);
  }
  return data;
}

function textFromChat(data: Record<string, unknown>) {
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content?.trim() ?? "";
}

function imageParts(images: ImageInput[]) {
  return images.map((image) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${image.mimeType};base64,${image.base64}`,
    },
  }));
}

async function chatJson<T>(options: {
  prompt: string;
  images?: ImageInput[];
  timeoutMs: number;
}): Promise<T> {
  const content =
    options.images?.length ?
      [
        { type: "text" as const, text: `${options.prompt}\nReturn JSON only.` },
        ...imageParts(options.images),
      ]
    : `${options.prompt}\nReturn JSON only.`;
  const data = await openaiFetch(
    "/chat/completions",
    {
      model: TEXT_MODEL,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    },
    options.timeoutMs,
  );
  return extractJson<T>(textFromChat(data));
}

export const openaiProvider: MediaProvider = {
  name: "openai",

  async understand({ text, images }) {
    try {
      const graph = await chatJson<AssemblyGraph>({
        timeoutMs: 40000,
        images,
        prompt: `You extract assembly procedures from instruction manuals for mechanical engineers.
Return JSON with this shape:
{
  "title": string,
  "documentId": string | null,
  "tools": string[],
  "parts": [{"id": string, "name": string, "qty": number}],
  "steps": [{
    "index": number,
    "title": string,
    "instruction": string,
    "figureRef": string | null,
    "fasteners": string[],
    "tools": string[],
    "warnings": string[],
    "torque": string | null,
    "dependsOn": number[]
  }],
  "notes": string[]
}
Rules:
- Never invent fasteners, torque, tools, or part IDs.
- Keep at most ${MAX_SCENES} steps from the first coherent procedure.
- Copy warnings verbatim.
Manual text:
${text.slice(0, 20000)}`,
      });
      if (!graph.steps?.length) {
        return demoProvider.understand({ text, images });
      }
      graph.steps = graph.steps.slice(0, MAX_SCENES);
      graph.parts = graph.parts ?? [];
      graph.tools = graph.tools ?? [];
      graph.notes = graph.notes ?? [];
      return graph;
    } catch (error) {
      console.warn("OpenAI understand failed, using demo parser", error);
      return demoProvider.understand({ text, images });
    }
  },

  async plan(graph) {
    try {
      const parsed = await chatJson<{ scenes: Scene[] }>({
        timeoutMs: 30000,
        prompt: `You are a technical-video director for mechanical assembly.
Turn this assembly graph into at most ${MAX_SCENES} scenes.
Dual channel: narration explains; on-screen text is step index, part IDs, torque, and warnings — not a read-aloud.
Prefer startFrameStrategy "manual-figure". Use "generated-isometric" only if a step has no figure.
motionPrompt describes camera and hands only. Do not add hardware.
Return JSON: { "scenes": [{
  "id": string, "index": number, "title": string, "narration": string,
  "onScreenCallouts": string[], "motionPrompt": string, "framePrompt": string,
  "startFrameStrategy": "manual-figure" | "generated-isometric",
  "warnings": string[], "allowedPartIds": string[]
}] }
Graph:
${JSON.stringify(graph)}`,
      });
      if (!parsed.scenes?.length) return demoProvider.plan(graph);
      return parsed.scenes.slice(0, MAX_SCENES);
    } catch (error) {
      console.warn("OpenAI plan failed, using demo planner", error);
      return demoProvider.plan(graph);
    }
  },

  async enhancePrompt(scene, critique) {
    if (!critique) return scene;
    try {
      const parsed = await chatJson<{ framePrompt: string; motionPrompt: string }>({
        timeoutMs: 20000,
        prompt: `Rewrite framePrompt and motionPrompt so the next generation fixes this critique.
Do not add parts that are not in allowedPartIds.
Return JSON with framePrompt and motionPrompt.
Scene: ${JSON.stringify(scene)}
Critique: ${critique}`,
      });
      return {
        ...scene,
        framePrompt: parsed.framePrompt ?? scene.framePrompt,
        motionPrompt: parsed.motionPrompt ?? scene.motionPrompt,
      };
    } catch {
      return demoProvider.enhancePrompt(scene, critique);
    }
  },

  async generateFrame({ scene }) {
    try {
      const data = await openaiFetch(
        "/images/generations",
        {
          model: IMAGE_MODEL,
          prompt: `16:9 technical assembly frame for a mechanical manual. Stay faithful to the described hardware. Do not invent fasteners or extra parts.
${scene.framePrompt}
Callouts allowed: ${scene.onScreenCallouts.join(", ")}
Allowed part IDs: ${scene.allowedPartIds.join(", ")}`,
          size: "1536x1024",
        },
        45000,
      );
      const first = (data.data as Array<{ b64_json?: string }> | undefined)?.[0];
      if (!first?.b64_json) return null;
      return Buffer.from(first.b64_json, "base64");
    } catch (error) {
      console.warn("OpenAI image generation failed", error);
      return null;
    }
  },

  async generateVideo() {
    return false;
  },

  async evaluateFrame({ scene, frame, previousFrame, knownPartIds }) {
    try {
      const images = [frame];
      if (previousFrame) images.push(previousFrame);
      const scores = await chatJson<EvaluationScores>({
        timeoutMs: 25000,
        images,
        prompt: `You are an assembly-video QA judge. Score the frame against the planned scene.
Return JSON:
{
  "similarity": number,
  "promptAdherence": number,
  "visualQuality": number,
  "partIdentity": number,
  "safetyCoverage": number,
  "inventedParts": boolean,
  "warningPresent": boolean,
  "sequenceCorrect": boolean,
  "temporalConsistency": number,
  "passed": boolean,
  "critique": string
}
Scores are 0-1. Fail if inventedParts is true or a required warning is missing.
Known BOM IDs: ${knownPartIds.join(", ")}
Allowed in this scene: ${scene.allowedPartIds.join(", ")}
Scene: ${JSON.stringify({
          index: scene.index,
          title: scene.title,
          narration: scene.narration,
          warnings: scene.warnings,
          callouts: scene.onScreenCallouts,
        })}`,
      });
      const invented =
        scores.inventedParts ||
        scene.allowedPartIds.some(
          (id) => knownPartIds.length > 0 && !knownPartIds.includes(id),
        );
      const warningPresent =
        scene.warnings.length === 0 ? true : Boolean(scores.warningPresent);
      return {
        ...scores,
        inventedParts: invented,
        warningPresent,
        passed:
          !invented &&
          warningPresent &&
          (scores.similarity ?? 0) >= 0.55 &&
          (scores.partIdentity ?? 0) >= 0.55,
      };
    } catch (error) {
      console.warn("OpenAI judge failed, using heuristic scores", error);
      return demoProvider.evaluateFrame({
        scene,
        frame,
        previousFrame,
        knownPartIds,
      });
    }
  },
};
