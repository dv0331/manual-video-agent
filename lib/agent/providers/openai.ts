import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { burnCalloutsOnVideo } from "@/lib/agent/ffmpeg";
import { extractJson } from "@/lib/agent/json";
import { narrationScript } from "@/lib/agent/narration";
import { withTimeout } from "@/lib/agent/timeout";
import { MAX_SCENES, type AssemblyGraph, type EvaluationScores, type Scene } from "@/lib/agent/types";
import { demoProvider } from "@/lib/agent/providers/demo";
import type { ImageInput, MediaProvider } from "@/lib/agent/providers/types";
import { fastCut } from "@/lib/agent/fast";
import { trace, traceFailure } from "@/lib/agent/trace";

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5";
const VIDEO_MODEL = process.env.OPENAI_VIDEO_MODEL ?? "sora-2";

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** After one Sora timeout/fail, skip the rest of this process — polls were ~150s and still failed. */
let soraDisabledForProcess = false;

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

async function openaiForm(path: string, body: FormData, timeoutMs: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const response = await withTimeout(
    fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
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

async function generateImageEdit(prompt: string, reference: ImageInput) {
  try {
    const png = await sharp(Buffer.from(reference.base64, "base64"))
      .resize(1536, 1024, { fit: "contain", background: { r: 20, g: 20, b: 20, alpha: 1 } })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set("model", IMAGE_MODEL);
    form.set("prompt", prompt);
    form.set("size", "1536x1024");
    const quality = process.env.OPENAI_IMAGE_QUALITY ?? "low";
    form.set("quality", quality);
    form.set("image", new Blob([new Uint8Array(png)], { type: "image/png" }), "reference.png");
    const data = await openaiForm("/images/edits", form, 50000);
    const first = (data.data as Array<{ b64_json?: string }> | undefined)?.[0];
    if (!first?.b64_json) return null;
    return Buffer.from(first.b64_json, "base64");
  } catch (error) {
    await traceFailure("OpenAI image edit", error, "falling back to text generation");
    return null;
  }
}

async function pollVideo(id: string, timeoutMs: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const response = await withTimeout(
      fetch(`${baseUrl()}/videos/${id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      20000,
      `OpenAI video poll ${id}`,
    );
    last = (await response.json()) as Record<string, unknown>;
    const status = last.status as string | undefined;
    await trace(`Sora ${id.slice(0, 8)} status=${status ?? "pending"}`);
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return { ...last, status: "timeout" };
}

async function downloadVideo(id: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const response = await withTimeout(
    fetch(`${baseUrl()}/videos/${id}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }),
    60000,
    "OpenAI video download",
  );
  if (!response.ok) {
    throw new Error(`OpenAI video download failed (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function openaiSpeech(text: string, instructions?: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const preferred = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE ?? "coral";
  const attempts = [
    {
      model: preferred,
      voice,
      input: text,
      instructions:
        instructions ||
        "Speak like a calm assembly instructor at a workbench. Clear, unhurried, no cheerfulness. Neutral American accent, about 140 words per minute.",
      response_format: "mp3",
    },
    {
      model: "tts-1",
      voice: voice === "coral" ? "alloy" : voice,
      input: text,
      response_format: "mp3",
    },
  ];
  let lastError: Error | undefined;
  for (const body of attempts) {
    try {
      const response = await withTimeout(
        fetch(`${baseUrl()}/audio/speech`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
        30000,
        "OpenAI speech",
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message ?? `OpenAI speech failed (${response.status})`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("OpenAI speech failed");
    }
  }
  throw lastError ?? new Error("OpenAI speech failed");
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
        timeoutMs: fastCut() ? 7000 : 40000,
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
      await traceFailure("OpenAI understand", error, "using demo parser");
      return demoProvider.understand({ text, images });
    }
  },

  async plan(graph) {
    try {
      const parsed = await chatJson<{ scenes: Scene[] }>({
        timeoutMs: 30000,
        prompt: `You are a technical-video director for mechanical assembly.
Turn this assembly graph into at most ${MAX_SCENES} scenes for an 8-second-per-scene film.
Dual channel: narration explains; on-screen text is step index, part IDs, torque, and warnings — not a read-aloud.
Every scene is a real person assembling the product — startFrameStrategy "human-assembly".
narration must be ~20 words spoken in 8 seconds.
cameraMotion must be one of: slow_left_to_right, slow_zoom_in, slow_zoom_out, static.
visualDescription is a clean bench layout for that step.
soundEffects names workshop sounds only (no music).
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

  async generateFrame({ scene, reference }) {
    const prompt = `Photoreal 16:9 how-to photo of a real person assembling the product. Stay faithful to the hardware in the reference figure if one is provided. Do not invent fasteners or extra parts.
${scene.framePrompt}
Callouts allowed: ${scene.onScreenCallouts.join(", ")}
Allowed part IDs: ${scene.allowedPartIds.join(", ")}`;
    try {
      if (reference) {
        const edited = await generateImageEdit(prompt, reference);
        if (edited) return edited;
      }
      const body: Record<string, unknown> = {
        model: IMAGE_MODEL,
        prompt,
        size: "1536x1024",
      };
      body.quality = process.env.OPENAI_IMAGE_QUALITY ?? "low";
      const data = await openaiFetch("/images/generations", body, 45000);
      const first = (data.data as Array<{ b64_json?: string }> | undefined)?.[0];
      if (!first?.b64_json) return null;
      return Buffer.from(first.b64_json, "base64");
    } catch (error) {
      await traceFailure("OpenAI image generation", error, "no generated frame");
      return null;
    }
  },

  async generateVideo({ scene, framePath, outputPath, totalScenes }) {
    if (process.env.USE_SORA === "0" || soraDisabledForProcess) return false;
    try {
      const seconds = ["4", "8", "12"].includes(process.env.OPENAI_VIDEO_SECONDS ?? "")
        ? (process.env.OPENAI_VIDEO_SECONDS as string)
        : "8";
      const jpeg = await sharp(framePath)
        .resize(1280, 720, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer();
      const form = new FormData();
      form.set("model", VIDEO_MODEL);
      form.set(
        "prompt",
        `${scene.motionPrompt}
A real adult assembling the product in a continuous documentary shot. Keep the machine and hardware identical to the start frame. person_generation allow_adult. No extra parts, no on-screen text.`,
      );
      form.set("size", "1280x720");
      form.set("seconds", seconds);
      form.set("input_reference", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "frame.jpg");

      await trace(`Sora create starting model=${VIDEO_MODEL} seconds=${seconds}`);
      const created = await openaiForm("/videos", form, 45000);
      const id = created.id as string | undefined;
      if (!id) return false;

      const finished = await pollVideo(id, 150000);
      if (finished.status !== "completed") {
        soraDisabledForProcess = true;
        await traceFailure(
          "Sora",
          new Error(`${String(finished.status)} ${JSON.stringify(finished.error ?? "")}`),
          "skipping it for later scenes and using Ken Burns",
        );
        return false;
      }

      const bytes = await downloadVideo(id);
      const rawPath = `${outputPath}.sora.mp4`;
      await writeFile(rawPath, bytes);
      await burnCalloutsOnVideo({
        inputPath: rawPath,
        outputPath,
        scene,
        totalScenes: totalScenes ?? scene.index,
      });
      return true;
    } catch (error) {
      soraDisabledForProcess = true;
      await traceFailure("OpenAI Sora", error, "skipping it for later scenes");
      return false;
    }
  },

  async generateSpeech({ scene, totalScenes }) {
    try {
      return await openaiSpeech(
        narrationScript(scene, totalScenes),
        scene.voiceProfile,
      );
    } catch (error) {
      await traceFailure("OpenAI speech", error, "using local narration");
      return demoProvider.generateSpeech({ scene, totalScenes });
    }
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
  "narrationAlignment": number,
  "motionCoherence": number,
  "cheapGate": number,
  "failureType": "visual" | "audio" | "none",
  "passed": boolean,
  "critique": string
}
Scores are 0-1. cheapGate is a fast overall alignment score (SigLIP-style).
failureType is visual if parts/style are wrong, audio if the planned spoken line could not match this still, none if it passes.
Fail if inventedParts is true or a required warning is missing. Always explain the critique so the next prompt can be rewritten.
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
      await traceFailure("OpenAI judge", error, "using heuristic scores");
      return demoProvider.evaluateFrame({
        scene,
        frame,
        previousFrame,
        knownPartIds,
      });
    }
  },
};
