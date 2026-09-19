import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateScene } from "@/lib/agent/evaluate";
import { kenBurnsClip, mediaDuration, muxNarration } from "@/lib/agent/ffmpeg";
import { demoProvider } from "@/lib/agent/providers/demo";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, Scene, SceneResult } from "@/lib/agent/types";
import { MAX_RETRIES, SCENE_SECONDS } from "@/lib/agent/types";

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

    const reference = scene.figurePath
      ? {
          mimeType: "image/png",
          base64: (await readFile(scene.figurePath)).toString("base64"),
        }
      : undefined;
    const generated = await options.provider.generateFrame({
      scene,
      reference,
    });
    if (generated) {
      await writeFile(framePath, generated);
    } else if (scene.figurePath) {
      await copyFile(scene.figurePath, framePath);
    } else {
      throw new Error(`No figure available for ${scene.title}`);
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

  const speechDir = path.join(options.jobPath, "speech");
  await mkdir(speechDir, { recursive: true });
  const speechPath = path.join(speechDir, `${scene.id}.mp3`);
  let spoken = await options.provider.generateSpeech({
    scene,
    totalScenes: options.totalScenes,
  });
  if (!spoken && options.provider.name !== "demo") {
    spoken = await demoProvider.generateSpeech({
      scene,
      totalScenes: options.totalScenes,
    });
  }
  const speechFile = spoken
    ? path.join(speechDir, `${scene.id}${spoken[0] === 0x52 ? ".wav" : ".mp3"}`)
    : speechPath;
  let speechSeconds = 0;
  if (spoken) {
    await writeFile(speechFile, spoken);
    try {
      speechSeconds = await mediaDuration(speechFile);
    } catch {
      speechSeconds = 0;
    }
  }

  const animated = await options.provider.generateVideo({
    scene,
    framePath,
    outputPath: clipPath,
    totalScenes: options.totalScenes,
  });
  let durationSeconds = SCENE_SECONDS;
  if (animated) {
    motionSource = options.provider.name === "openai" ? "sora" : "veo";
    durationSeconds = Number(process.env.OPENAI_VIDEO_SECONDS ?? 8);
    if (![4, 8, 12].includes(durationSeconds)) durationSeconds = 8;
    if (spoken) {
      const mixed = `${clipPath}.narrated.mp4`;
      try {
        await muxNarration({
          videoPath: clipPath,
          audioPath: speechFile,
          outputPath: mixed,
          seconds: durationSeconds,
        });
        await copyFile(mixed, clipPath);
      } catch (error) {
        console.warn("Could not mix narration onto the motion clip", error);
      }
    }
  } else {
    durationSeconds = Math.max(SCENE_SECONDS, Math.ceil(speechSeconds + 0.4));
    await kenBurnsClip({
      framePath,
      outputPath: clipPath,
      scene,
      totalScenes: options.totalScenes,
      seconds: durationSeconds,
      audioPath: spoken ? speechFile : undefined,
    });
    motionSource = "kenburns";
  }

  return {
    scene: { ...scene, durationSeconds },
    framePath,
    clipPath,
    attempts,
    evaluation,
    motionSource,
    durationSeconds,
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
