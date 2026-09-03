import { readFile } from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import { extractJson } from "@/lib/agent/json";
import { withTimeout } from "@/lib/agent/timeout";
import { MAX_SCENES, type AssemblyGraph, type EvaluationScores, type Scene } from "@/lib/agent/types";
import { demoProvider } from "@/lib/agent/providers/demo";
import type { ImageInput, MediaProvider } from "@/lib/agent/providers/types";

const TEXT_MODEL = "gemini-3.6-flash";
const IMAGE_MODEL = "gemini-3.1-flash-image";
const VIDEO_MODEL = "veo-3.1-lite-generate-preview";

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

function textFromResponse(response: { text?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }) {
  if (response.text) return response.text;
  return (
    response.candidates
      ?.flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}

function inlineImage(image: ImageInput) {
  return {
    inlineData: {
      mimeType: image.mimeType,
      data: image.base64,
    },
  };
}

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export const geminiProvider: MediaProvider = {
  name: "gemini",

  async understand({ text, images }) {
    try {
      const ai = client();
      const parts: Array<Record<string, unknown>> = [
        {
          text: `You extract assembly procedures from instruction manuals for mechanical engineers.
Return JSON only with this shape:
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
        },
      ];
      for (const image of images.slice(0, 8)) {
        parts.push(inlineImage(image));
      }
      const response = await withTimeout(
        ai.models.generateContent({
          model: TEXT_MODEL,
          contents: [{ role: "user", parts }],
        }),
        35000,
        "Gemini understand",
      );
      const graph = extractJson<AssemblyGraph>(textFromResponse(response));
      if (!graph.steps?.length) {
        return demoProvider.understand({ text, images });
      }
      graph.steps = graph.steps.slice(0, MAX_SCENES);
      graph.parts = graph.parts ?? [];
      graph.tools = graph.tools ?? [];
      graph.notes = graph.notes ?? [];
      return graph;
    } catch (error) {
      console.warn("Gemini understand failed, using demo parser", error);
      return demoProvider.understand({ text, images });
    }
  },

  async plan(graph) {
    try {
      const ai = client();
      const response = await withTimeout(
        ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `You are a technical-video director for mechanical assembly.
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
        }),
        25000,
        "Gemini plan",
      );
      const parsed = extractJson<{ scenes: Scene[] }>(textFromResponse(response));
      if (!parsed.scenes?.length) return demoProvider.plan(graph);
      return parsed.scenes.slice(0, MAX_SCENES);
    } catch (error) {
      console.warn("Gemini plan failed, using demo planner", error);
      return demoProvider.plan(graph);
    }
  },

  async enhancePrompt(scene, critique) {
    if (!critique) return scene;
    try {
      const ai = client();
      const response = await withTimeout(
        ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `Rewrite framePrompt and motionPrompt so the next generation fixes this critique.
Do not add parts that are not in allowedPartIds.
Return JSON with framePrompt and motionPrompt.
Scene: ${JSON.stringify(scene)}
Critique: ${critique}`,
        }),
        20000,
        "Gemini prompt rewrite",
      );
      const parsed = extractJson<{ framePrompt: string; motionPrompt: string }>(
        textFromResponse(response),
      );
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
    try {
      const ai = client();
      const parts: Array<Record<string, unknown>> = [
        {
          text: `Generate a 16:9 technical assembly frame for a mechanical manual.
Stay faithful to the reference figure if provided. Do not invent fasteners or extra parts.
${scene.framePrompt}
Callouts allowed: ${scene.onScreenCallouts.join(", ")}
Allowed part IDs: ${scene.allowedPartIds.join(", ")}`,
        },
      ];
      if (reference) parts.push(inlineImage(reference));
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: [{ role: "user", parts }],
      });
      const inline = response.candidates
        ?.flatMap((c) => c.content?.parts ?? [])
        .find((p) => p.inlineData?.data);
      if (!inline?.inlineData?.data) return null;
      return Buffer.from(inline.inlineData.data, "base64");
    } catch (error) {
      console.warn("Nano Banana frame failed", error);
      return null;
    }
  },

  async generateVideo({ scene, framePath, outputPath }) {
    if (process.env.USE_VEO !== "1") return false;
    try {
      const ai = client();
      const bytes = await readFile(framePath);
      let operation = await ai.models.generateVideos({
        model: VIDEO_MODEL,
        source: {
          prompt: `${scene.motionPrompt}. Keep the machine and hardware identical to the start frame. No extra parts.`,
          image: {
            imageBytes: bytes.toString("base64"),
            mimeType: "image/png",
          },
        },
        config: {
          numberOfVideos: 1,
          aspectRatio: "16:9",
        },
      });

      const deadline = Date.now() + 90_000;
      while (!operation.done && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
      }
      const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
      const videoBytes = operation.response?.generatedVideos?.[0]?.video?.videoBytes;
      if (videoBytes) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(outputPath, Buffer.from(videoBytes, "base64"));
        return true;
      }
      if (uri) {
        const apiKey = process.env.GEMINI_API_KEY;
        const res = await fetch(`${uri}${uri.includes("?") ? "&" : "?"}key=${apiKey}`);
        if (!res.ok) return false;
        const { writeFile } = await import("node:fs/promises");
        await writeFile(outputPath, Buffer.from(await res.arrayBuffer()));
        return true;
      }
      return false;
    } catch (error) {
      console.warn("Veo animation failed", error);
      return false;
    }
  },

  async evaluateFrame({ scene, frame, previousFrame, knownPartIds }) {
    try {
      const ai = client();
      const parts: Array<Record<string, unknown>> = [
        {
          text: `You are an assembly-video QA judge. Score the frame against the planned scene.
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
        },
        inlineImage(frame),
      ];
      if (previousFrame) parts.push(inlineImage(previousFrame));
      const response = await withTimeout(
        ai.models.generateContent({
          model: TEXT_MODEL,
          contents: [{ role: "user", parts }],
        }),
        20000,
        "Gemini judge",
      );
      const scores = extractJson<EvaluationScores>(textFromResponse(response));
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
          scores.similarity >= 0.55 &&
          scores.partIdentity >= 0.55,
      };
    } catch (error) {
      console.warn("Gemini judge failed, using heuristic scores", error);
      return demoProvider.evaluateFrame({
        scene,
        frame,
        previousFrame,
        knownPartIds,
      });
    }
  },
};
