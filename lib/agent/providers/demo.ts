import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultCamera, defaultSound } from "@/lib/agent/direction";
import { narrationScript } from "@/lib/agent/narration";
import { SAMPLE_GRAPH, SAMPLE_MANUAL_TEXT } from "@/lib/sample-manual/graph";
import type { AssemblyGraph, EvaluationScores, Scene } from "@/lib/agent/types";
import { MAX_SCENES } from "@/lib/agent/types";
import type { MediaProvider } from "@/lib/agent/providers/types";

function looksLikeSample(text: string) {
  return /AP-1-ASM-001|arbor press|P-02 Column/i.test(text);
}

function parseHeuristicGraph(text: string): AssemblyGraph {
  if (looksLikeSample(text) || !text.trim()) {
    return structuredClone(SAMPLE_GRAPH);
  }

  const steps: AssemblyGraph["steps"] = [];
  const stepRe =
    /(?:^|\n)\s*(?:step\s*)?(\d+)[\).:\-]?\s+([^\n]+)([\s\S]*?)(?=(?:\n\s*(?:step\s*)?\d+[\).:\-])|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = stepRe.exec(text)) && steps.length < MAX_SCENES) {
    const body = match[3].replace(/\s+/g, " ").trim();
    const warnings = [...body.matchAll(/warning[:\s]+([^.\n]+)/gi)].map((m) =>
      m[1].trim(),
    );
    steps.push({
      index: Number(match[1]),
      title: match[2].trim().slice(0, 80),
      instruction: (body || match[2]).slice(0, 400),
      figureRef: body.match(/figure\s+\d+/i)?.[0],
      fasteners: [...body.matchAll(/\b([A-Z]-?\d{2,})\b/g)].map((m) => m[1]),
      tools: [],
      warnings,
    });
  }

  if (steps.length === 0) {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 40)
      .slice(0, MAX_SCENES);
    paragraphs.forEach((paragraph, i) => {
      steps.push({
        index: i + 1,
        title: paragraph.slice(0, 72),
        instruction: paragraph.slice(0, 400),
        fasteners: [],
        tools: [],
        warnings: [],
      });
    });
  }

  if (steps.length === 0) {
    return structuredClone(SAMPLE_GRAPH);
  }

  return {
    title: "Uploaded assembly procedure",
    tools: [],
    parts: [],
    steps,
    notes: ["Parsed without Gemini. Verify part IDs against the source manual."],
  };
}

function scenesFromGraph(graph: AssemblyGraph): Scene[] {
  return graph.steps.slice(0, MAX_SCENES).map((step) => {
    const allowed = [
      ...graph.parts.map((p) => p.id),
      ...step.fasteners,
    ].filter(Boolean);
    return {
      id: `scene-${step.index}`,
      index: step.index,
      title: step.title,
      narration: step.instruction,
      onScreenCallouts: [
        step.figureRef,
        ...step.fasteners,
        step.torque ? `Torque ${step.torque}` : "",
      ].filter((v): v is string => Boolean(v)),
      motionPrompt: `A real person assembling ${graph.title}: ${step.instruction} Documentary workshop shot. Hands only move the parts named in the manual.`,
      framePrompt: `Photoreal 16:9 photo of a person assembling ${graph.title}. ${step.instruction}`,
      startFrameStrategy: "human-assembly",
      warnings: step.warnings,
      allowedPartIds: [...new Set(allowed)],
      cameraMotion: defaultCamera(step.index),
      soundEffects: defaultSound(step.title),
      visualDescription: step.instruction,
    };
  });
}

export const demoProvider: MediaProvider = {
  name: "demo",
  async understand({ text }) {
    return parseHeuristicGraph(text || SAMPLE_MANUAL_TEXT);
  },
  async plan(graph) {
    return scenesFromGraph(graph);
  },
  async enhancePrompt(scene, critique) {
    if (!critique) return scene;
    return {
      ...scene,
      framePrompt: `${scene.framePrompt}\nCorrect this: ${critique}`,
    };
  },
  async generateFrame() {
    return null;
  },
  async generateVideo() {
    return false;
  },
  async generateSpeech({ scene, totalScenes }) {
    const text = narrationScript(scene, totalScenes);
    const wavPath = path.join(tmpdir(), `mtav-${scene.id}-${Date.now()}.wav`);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "espeak-ng",
          ["-v", "en-us", "-s", "148", "-w", wavPath, text],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.slice(-400) || `espeak-ng exited ${code}`));
        });
      });
      return await readFile(wavPath);
    } catch (error) {
      console.warn("Local narration failed", error);
      return null;
    } finally {
      await unlink(wavPath).catch(() => undefined);
    }
  },
  async evaluateFrame({ scene, knownPartIds }) {
    const invented = scene.allowedPartIds.some(
      (id) => knownPartIds.length > 0 && !knownPartIds.includes(id),
    );
    const warningPresent =
      scene.warnings.length === 0 || scene.warnings.every(Boolean);
    const scores: EvaluationScores = {
      similarity: 0.86,
      promptAdherence: 0.88,
      visualQuality: 0.8,
      partIdentity: invented ? 0.4 : 0.9,
      safetyCoverage: warningPresent ? 0.92 : 0.45,
      inventedParts: invented,
      warningPresent,
      sequenceCorrect: scene.index >= 1,
      temporalConsistency: 0.84,
      passed: !invented && warningPresent,
      critique: invented
        ? "Scene mentions a part ID that is not in the extracted BOM."
        : "Source-faithful figure and callouts match the planned step.",
      failureType: invented ? "visual" : "none",
      narrationAlignment: 0.9,
      motionCoherence: 0.82,
      cheapGate: invented ? 0.18 : 0.86,
    };
    return scores;
  },
};
