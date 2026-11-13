import sharp from "sharp";
import { extractJson } from "@/lib/agent/json";
import { narrationScript } from "@/lib/agent/narration";
import { sleep } from "@/lib/agent/pool";
import {
  STORYBOARD_SCHEMA,
  normalizeStoryboard,
  storyboardMessages,
  type Storyboard,
} from "@/lib/agent/storyboard";
import { trace, traceFailure } from "@/lib/agent/trace";
import { MAX_SCENES, type AssemblyGraph, type EvaluationScores, type Scene } from "@/lib/agent/types";
import { demoProvider } from "@/lib/agent/providers/demo";
import type { ImageInput, MediaProvider, StillJudgement } from "@/lib/agent/providers/types";

const env = (name: string, fallback: string) => process.env[name]?.trim() || fallback;

const STORYBOARD_MODEL = env("OPENAI_STORYBOARD_MODEL", "gpt-5.5");
const STORYBOARD_EFFORT = env("OPENAI_STORYBOARD_EFFORT", "low");
const FAST_TEXT_MODEL = env("OPENAI_FAST_TEXT_MODEL", "gpt-5.4-mini");
const JUDGE_MODEL = env("OPENAI_JUDGE_MODEL", "gpt-4.1-mini");
const TTS_MODEL = env("OPENAI_TTS_MODEL", "gpt-4o-mini-tts");
const TTS_VOICE = env("OPENAI_TTS_VOICE", "cedar");
const IMAGE_QUALITY = env("OPENAI_IMAGE_QUALITY", "medium");
/** JPEG at this quality is about a tenth of the PNG the API sends by default, and the film downsamples it to 720p anyway. */
const IMAGE_COMPRESSION = 92;
const IMAGE_MODELS = [
  ...env("OPENAI_IMAGE_MODEL", "").split(","),
  "gpt-image-2.6-flare",
  "gpt-image-2.5-flare",
  "gpt-image-1.5",
]
  .map((model) => model.trim())
  .filter((model, i, all) => model && all.indexOf(model) === i);

const VOICE_INSTRUCTIONS =
  "A calm, clear, friendly instructor explaining furniture assembly to a beginner. Unhurried, about 150 words per minute, with natural pauses between sentences. Neutral American accent.";

/** Image models that refused this key, skipped for the rest of the process. */
const deadImageModels = new Set<string>();

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function baseUrl() {
  return env("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");
}

class OpenAIError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);

/** Node's fetch only says "fetch failed"; the socket-level reason is on `cause`. */
function networkReason(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const detail = [cause?.code, cause?.message].filter(Boolean).join(": ");
  return detail ? `${error.message} (${detail})` : error.message;
}

async function openaiRequest(
  path: string,
  init: { json?: unknown; form?: () => FormData },
  timeoutMs: number,
  label = `OpenAI ${path}`,
): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  let networkFailures = 0;
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl()}${path}`, {
        method: "POST",
        headers: init.json
          ? { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }
          : { Authorization: `Bearer ${apiKey}` },
        body: init.json ? JSON.stringify(init.json) : init.form?.(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      const failure = new Error(
        timedOut ? `${label} timed out after ${timeoutMs / 1000}s` : `${label} could not connect: ${networkReason(error)}`,
      );
      networkFailures += 1;
      if (networkFailures > 1) throw failure;
      await trace(`${failure.message} — retrying once`);
      continue;
    }
    if (response.ok) return response;
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    const error = new OpenAIError(
      data.error?.message ?? `${label} failed (${response.status})`,
      response.status,
    );
    if (!RETRYABLE.has(response.status) || attempt >= 2) throw error;
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1500 * (attempt + 1);
    await trace(`${label} answered ${response.status} — retrying in ${(waitMs / 1000).toFixed(1)}s`);
    await sleep(waitMs);
  }
}

async function openaiJson(path: string, body: unknown, timeoutMs: number, label?: string) {
  const response = await openaiRequest(path, { json: body }, timeoutMs, label);
  return (await response.json()) as Record<string, unknown>;
}

function textFromChat(data: Record<string, unknown>) {
  const choices = data.choices as Array<{ message?: { content?: string; refusal?: string } }> | undefined;
  const message = choices?.[0]?.message;
  if (message?.refusal) throw new Error(`Model refused: ${message.refusal}`);
  return message?.content?.trim() ?? "";
}

function imageParts(images: ImageInput[], detail: "low" | "high" | "auto" = "auto") {
  return images.map((image) => ({
    type: "image_url" as const,
    image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail },
  }));
}

async function chatJson<T>(options: {
  prompt: string;
  images?: ImageInput[];
  detail?: "low" | "high" | "auto";
  timeoutMs: number;
  model?: string;
}): Promise<T> {
  const content = options.images?.length
    ? [
        { type: "text" as const, text: `${options.prompt}\nReturn JSON only.` },
        ...imageParts(options.images, options.detail),
      ]
    : `${options.prompt}\nReturn JSON only.`;
  const model = options.model ?? FAST_TEXT_MODEL;
  const data = await openaiJson(
    "/chat/completions",
    {
      model,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      ...(model.startsWith("gpt-5") ? { reasoning_effort: "none" } : {}),
    },
    options.timeoutMs,
    `OpenAI ${model}`,
  );
  return extractJson<T>(textFromChat(data));
}

async function storyboardCall(
  model: string,
  effort: string,
  input: Parameters<NonNullable<MediaProvider["storyboard"]>>[0],
  timeoutMs: number,
): Promise<Storyboard> {
  const started = Date.now();
  const data = await openaiJson(
    "/chat/completions",
    {
      model,
      messages: storyboardMessages(input),
      response_format: {
        type: "json_schema",
        json_schema: { name: "storyboard", strict: true, schema: STORYBOARD_SCHEMA },
      },
      ...(effort ? { reasoning_effort: effort } : {}),
    },
    timeoutMs,
    `OpenAI storyboard ${model}`,
  );
  const board = normalizeStoryboard(
    JSON.parse(textFromChat(data)) as Storyboard,
    input.pages.length,
  );
  if (!board.scenes.length) throw new Error(`${model} returned no scenes`);
  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  await trace(
    `Storyboard by ${model} in ${((Date.now() - started) / 1000).toFixed(1)}s — ${board.scenes.length} scenes, ${usage?.prompt_tokens ?? "?"} tokens in, ${usage?.completion_tokens ?? "?"} out`,
  );
  return board;
}

async function editImage(model: string, prompt: string, reference: ImageInput) {
  const png = await sharp(Buffer.from(reference.base64, "base64"))
    .resize(1536, 1024, { fit: "contain", background: "#ffffff" })
    .png({ compressionLevel: 1 })
    .toBuffer();
  const response = await openaiRequest(
    "/images/edits",
    {
      form: () => {
        const form = new FormData();
        form.set("model", model);
        form.set("prompt", prompt);
        form.set("size", "1536x1024");
        form.set("quality", IMAGE_QUALITY);
        form.set("output_format", "jpeg");
        form.set("output_compression", String(IMAGE_COMPRESSION));
        form.set("image", new Blob([new Uint8Array(png)], { type: "image/png" }), "drawing.png");
        return form;
      },
    },
    90_000,
    `OpenAI ${model} edit`,
  );
  const data = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  return b64 ? Buffer.from(b64, "base64") : null;
}

async function generateImage(model: string, prompt: string) {
  const data = (await openaiJson(
    "/images/generations",
    {
      model,
      prompt,
      size: "1536x1024",
      quality: IMAGE_QUALITY,
      output_format: "jpeg",
      output_compression: IMAGE_COMPRESSION,
    },
    90_000,
    `OpenAI ${model}`,
  )) as { data?: Array<{ b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  return b64 ? Buffer.from(b64, "base64") : null;
}

function modelUnavailable(error: unknown) {
  if (!(error instanceof OpenAIError)) return false;
  return (
    error.status === 404 ||
    error.status === 403 ||
    (error.status === 400 && /model/i.test(error.message) && /(not|invalid|unknown|support)/i.test(error.message))
  );
}

async function openaiSpeech(text: string) {
  const attempts = [
    { model: TTS_MODEL, voice: TTS_VOICE, input: text, instructions: VOICE_INSTRUCTIONS, response_format: "wav" },
    { model: "tts-1-hd", voice: ["cedar", "marin"].includes(TTS_VOICE) ? "onyx" : TTS_VOICE, input: text, response_format: "wav" },
  ];
  let lastError: unknown;
  for (const body of attempts) {
    try {
      const response = await openaiRequest("/audio/speech", { json: body }, 45_000, `OpenAI ${body.model}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await traceFailure(`Voice ${body.model}`, error, "trying the next voice model");
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI speech failed");
}

export const openaiProvider: MediaProvider = {
  name: "openai",

  async storyboard(input) {
    try {
      return await storyboardCall(STORYBOARD_MODEL, STORYBOARD_EFFORT, input, 100_000);
    } catch (error) {
      await traceFailure(`Storyboard ${STORYBOARD_MODEL}`, error, `retrying with ${FAST_TEXT_MODEL}`);
      return storyboardCall(FAST_TEXT_MODEL, "none", input, 60_000);
    }
  },

  async generateStill({ prompt, reference }) {
    for (const model of IMAGE_MODELS) {
      if (deadImageModels.has(model)) continue;
      try {
        const image = reference ? await editImage(model, prompt, reference) : await generateImage(model, prompt);
        if (image) return image;
      } catch (error) {
        if (modelUnavailable(error)) deadImageModels.add(model);
        await traceFailure(`Still ${model}`, error, "trying the next image model");
      }
    }
    return null;
  },

  async speak(text) {
    return openaiSpeech(text);
  },

  async judgeStill({ scene, still, reference }) {
    const images = reference ? [reference, still] : [still];
    const verdict = await chatJson<Partial<StillJudgement>>({
      model: JUDGE_MODEL,
      timeoutMs: 25_000,
      images,
      detail: "low",
      prompt: `You check one frame of a furniture-assembly how-to video.
${reference ? "Image 1 is the official manual drawing for this moment. Image 2 is the generated photo." : "The image is the generated photo."}
Scene: ${scene.title}. Narration: ${scene.narration}
Photo brief: ${scene.visualDescription ?? ""}
Return JSON {"matches": number, "problems": string[], "critique": string}.
${reference ? "The drawing can show two or three steps in a row (for example the frame upside down, then turned upright). The photo only has to match one of those moments.\n" : ""}matches: 0 to 1, how clearly the photo shows the same product, parts, orientation, and assembly state as ${reference ? "one moment of the drawing" : "the brief"} (1 = clearly the same moment).
problems: only serious ones — wrong product or shape, missing or extra major parts, text or arrows or insets in the photo, deformed hands, impossible or floating parts. Color, room, lighting, camera angle, which moment of the step the photo shows (matches covers that), and exact counts of small fittings (screws, bolts, dowels, feet, keys) are never problems; the narration gives the counts. Empty list if none.
critique: one sentence telling the photographer what to change, or "" if nothing.`,
    });
    return {
      matches: Math.min(1, Math.max(0, Number(verdict.matches ?? 0))),
      problems: Array.isArray(verdict.problems) ? verdict.problems.filter(Boolean).map(String) : [],
      critique: String(verdict.critique ?? ""),
    };
  },

  async understand({ text, images }) {
    try {
      const graph = await chatJson<AssemblyGraph>({
        timeoutMs: 40000,
        images,
        prompt: `You extract assembly procedures from instruction manuals.
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
      await traceFailure("OpenAI understand", error, "using demo parser");
      return demoProvider.understand({ text, images });
    }
  },

  async plan(graph) {
    try {
      const parsed = await chatJson<{ scenes: Scene[] }>({
        timeoutMs: 30000,
        prompt: `You are a technical-video director for mechanical assembly.
Turn this assembly graph into at most ${MAX_SCENES} scenes.
narration is one to three complete spoken sentences.
cameraMotion must be one of: slow_left_to_right, slow_zoom_in, slow_zoom_out, static.
visualDescription is the photo for that step.
Do not invent hardware.
Return JSON: { "scenes": [{
  "id": string, "index": number, "title": string, "narration": string,
  "visualDescription": string, "cameraMotion": string, "soundEffects": string,
  "onScreenCallouts": string[], "motionPrompt": string, "framePrompt": string,
  "startFrameStrategy": "human-assembly",
  "warnings": string[], "allowedPartIds": string[]
}] }
Graph:
${JSON.stringify(graph)}`,
      });
      if (!parsed.scenes?.length) return demoProvider.plan(graph);
      return parsed.scenes.slice(0, MAX_SCENES);
    } catch (error) {
      await traceFailure("OpenAI plan", error, "using demo planner");
      return demoProvider.plan(graph);
    }
  },

  async enhancePrompt(scene, critique) {
    if (!critique) return scene;
    return {
      ...scene,
      framePrompt: `${scene.framePrompt}\nFix this from the last attempt: ${critique}`,
    };
  },

  async generateFrame({ scene, reference }) {
    const prompt = `Photoreal 16:9 how-to photo of a real person assembling the product. Stay faithful to the hardware in the reference figure if one is provided. Do not invent fasteners or extra parts.
${scene.framePrompt}
Callouts allowed: ${scene.onScreenCallouts.join(", ")}`;
    return this.generateStill?.({ prompt, reference }) ?? null;
  },

  async generateVideo() {
    // OpenAI retired the Videos API (Sora) on 2026-09-24; motion comes from the encoder.
    return false;
  },

  async generateSpeech({ scene, totalScenes }) {
    try {
      return await openaiSpeech(narrationScript(scene, totalScenes));
    } catch (error) {
      await traceFailure("OpenAI speech", error, "using local narration");
      return demoProvider.generateSpeech({ scene, totalScenes });
    }
  },

  async evaluateFrame({ scene, frame, knownPartIds }) {
    try {
      const verdict = await this.judgeStill!({ scene, still: frame });
      const passed = verdict.matches >= 0.55 && verdict.problems.length === 0;
      return {
        similarity: verdict.matches,
        promptAdherence: verdict.matches,
        visualQuality: verdict.problems.length ? 0.5 : 0.85,
        partIdentity: verdict.matches,
        safetyCoverage: 1,
        inventedParts: false,
        warningPresent: true,
        sequenceCorrect: true,
        temporalConsistency: 0.8,
        passed,
        critique: verdict.critique || verdict.problems.join("; ") || "Matches the brief",
        failureType: passed ? "none" : "visual",
        cheapGate: verdict.matches,
      } satisfies EvaluationScores;
    } catch (error) {
      await traceFailure("OpenAI judge", error, "using heuristic scores");
      return demoProvider.evaluateFrame({ scene, frame, knownPartIds });
    }
  },
};
