import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateScene } from "@/lib/agent/evaluate";
import { kenBurnsClip } from "@/lib/agent/ffmpeg";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, Scene, SceneResult } from "@/lib/agent/types";
import { MAX_RETRIES } from "@/lib/agent/types";

export async function generateScene(options: {
  provider: MediaProvider;
  scene: Scene;
  graph: AssemblyGraph;
  jobPath: string;
  previousFramePath?: string;
  totalScenes: number;
}): Promise<SceneResult> {
  const framesDir = path.join(options.jobPath, "frames");
  const clipsDir = path.join(options.jobPath, "clips");
  await mkdir(framesDir, { recursive: true });
  await mkdir(clipsDir, { recursive: true });

  let scene = options.scene;
  let lastCritique: string | undefined;
  let evaluation = await evaluatePlaceholder();
  const framePath = path.join(framesDir, `${scene.id}.png`);
  const clipPath = path.join(clipsDir, `${scene.id}.mp4`);
  let attempts = 0;
  let motionSource: SceneResult["motionSource"] = "kenburns";

  for (attempts = 1; attempts <= MAX_RETRIES + 1; attempts++) {
    if (lastCritique) {
      scene = await options.provider.enhancePrompt(scene, lastCritique);
    }

    if (scene.figurePath && scene.startFrameStrategy === "manual-figure") {
      await copyFile(scene.figurePath, framePath);
    } else {
      const generated = await options.provider.generateFrame({
        scene,
        reference: undefined,
      });
      if (generated) {
        await writeFile(framePath, generated);
      } else if (scene.figurePath) {
        await copyFile(scene.figurePath, framePath);
      } else {
        throw new Error(`No figure available for ${scene.title}`);
      }
    }

    evaluation = await evaluateScene({
      provider: options.provider,
      scene,
      framePath,
      previousFramePath: options.previousFramePath,
      graph: options.graph,
    });

    if (evaluation.passed || attempts > MAX_RETRIES) {
      break;
    }
    lastCritique = evaluation.critique;
  }

  const veo = await options.provider.generateVideo({
    scene,
    framePath,
    outputPath: clipPath,
  });
  if (veo) {
    motionSource = "veo";
  } else {
    await kenBurnsClip({
      framePath,
      outputPath: clipPath,
      scene,
      totalScenes: options.totalScenes,
    });
    motionSource = "kenburns";
  }

  return {
    scene,
    framePath,
    clipPath,
    attempts,
    evaluation,
    motionSource,
  };
}

async function evaluatePlaceholder() {
  return {
    similarity: 0,
    promptAdherence: 0,
    visualQuality: 0,
    partIdentity: 0,
    safetyCoverage: 0,
    inventedParts: false,
    warningPresent: true,
    sequenceCorrect: true,
    temporalConsistency: 0,
    passed: false,
    critique: "",
  };
}
