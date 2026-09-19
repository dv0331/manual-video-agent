import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { motionPromptWithAudio } from "@/lib/agent/direction";
import { emptyEvaluation, evaluateClip, evaluateScene } from "@/lib/agent/evaluate";
import { kenBurnsClip, mediaDuration, muxNarration } from "@/lib/agent/ffmpeg";
import { logProduction } from "@/lib/agent/production-log";
import { demoProvider } from "@/lib/agent/providers/demo";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, EvaluationScores, Scene, SceneResult } from "@/lib/agent/types";
import { MAX_VIDEO_RETRIES, SCENE_SECONDS } from "@/lib/agent/types";

export async function generateScene(options: {
  provider: MediaProvider;
  scene: Scene;
  graph: AssemblyGraph;
  jobPath: string;
  previousFramePath?: string;
  totalScenes: number;
  onBeat?: (label: string) => Promise<void>;
}): Promise<SceneResult> {
  const framesDir = path.join(options.jobPath, "frames");
  const clipsDir = path.join(options.jobPath, "clips");
  await mkdir(framesDir, { recursive: true });
  await mkdir(clipsDir, { recursive: true });

  let scene = options.scene;
  const framePath = path.join(framesDir, `${scene.id}.png`);
  const clipPath = path.join(clipsDir, `${scene.id}.mp4`);
  let evaluation = emptyEvaluation();
  let attempts = 0;
  let motionSource: SceneResult["motionSource"] = "kenburns";

  evaluation = await generateStill({
    ...options,
    scene,
    framePath,
  });
  attempts = 1;
  if (!evaluation.passed && evaluation.failureType === "visual") {
    await options.onBeat?.(
      `Scene ${scene.index}: judge failed visual — rewriting the still prompt`,
    );
    scene = await options.provider.enhancePrompt(scene, evaluation.critique);
    evaluation = await generateStill({
      ...options,
      scene,
      framePath,
    });
    attempts = 2;
  }

  const speech = await writeSpeech(options, scene);
  let durationSeconds = Math.max(SCENE_SECONDS, Math.ceil(speech.seconds + 0.4));
  let videoAttempts = 0;

  for (videoAttempts = 1; videoAttempts <= MAX_VIDEO_RETRIES + 1; videoAttempts++) {
    await options.onBeat?.(
      `Scene ${scene.index}: image-to-video with spoken narration (${videoAttempts === 1 ? "first take" : "audio retry"})`,
    );
    await kenBurnsClip({
      framePath,
      outputPath: clipPath,
      scene,
      totalScenes: options.totalScenes,
      seconds: durationSeconds,
      audioPath: speech.path,
    });
    motionSource = "kenburns";

    const soraPath = `${clipPath}.sora-raw.mp4`;
    const motionPrompt = motionPromptWithAudio(scene);
    const animated = await options.provider.generateVideo({
      scene: { ...scene, motionPrompt },
      framePath,
      outputPath: soraPath,
      totalScenes: options.totalScenes,
    });
    if (animated) {
      motionSource = options.provider.name === "openai" ? "sora" : "veo";
      const motionSeconds = Number(process.env.OPENAI_VIDEO_SECONDS ?? 8);
      durationSeconds = [4, 8, 12].includes(motionSeconds) ? motionSeconds : 8;
      try {
        if (speech.path) {
          await muxNarration({
            videoPath: soraPath,
            audioPath: speech.path,
            outputPath: clipPath,
            seconds: durationSeconds,
          });
        } else {
          await copyFile(soraPath, clipPath);
        }
      } catch (error) {
        console.warn("Could not mix narration onto the motion clip; keeping spoken still", error);
        motionSource = "kenburns";
        durationSeconds = Math.max(SCENE_SECONDS, Math.ceil(speech.seconds + 0.4));
      }
    }

    evaluation = await evaluateClip({
      still: evaluation,
      speechPath: speech.path,
    });
    if (evaluation.passed || evaluation.failureType !== "audio") {
      break;
    }
    await options.onBeat?.(
      `Scene ${scene.index}: audio fail — regenerating the clip, reusing the still`,
    );
    await logProduction(
      options.jobPath,
      `Scene ${scene.index} audio retry (keep ${path.basename(framePath)})`,
    );
  }

  await logProduction(
    options.jobPath,
    `Scene ${scene.index} ${evaluation.passed ? "PASS" : "accepted"} type=${evaluation.failureType} motion=${motionSource} stillAttempts=${attempts} videoAttempts=${videoAttempts}`,
  );

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

async function generateStill(options: {
  provider: MediaProvider;
  scene: Scene;
  graph: AssemblyGraph;
  jobPath: string;
  previousFramePath?: string;
  framePath: string;
  onBeat?: (label: string) => Promise<void>;
}): Promise<EvaluationScores> {
  const scene = options.scene;
  await options.onBeat?.(`Scene ${scene.index}: start frame from the manual figure`);
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
    await writeFile(options.framePath, generated);
  } else if (scene.figurePath) {
    await copyFile(scene.figurePath, options.framePath);
  } else {
    throw new Error(`No figure available for ${scene.title}`);
  }

  await options.onBeat?.(`Scene ${scene.index}: stacked judge on the still`);
  const evaluation = await evaluateScene({
    provider: options.provider,
    scene,
    framePath: options.framePath,
    previousFramePath: options.previousFramePath,
    graph: options.graph,
  });
  await logProduction(
    options.jobPath,
    `Scene ${scene.index} still ${evaluation.passed ? "PASS" : "FAIL"} cheap=${(evaluation.cheapGate ?? 0).toFixed(2)} parts=${evaluation.partIdentity.toFixed(2)} ${evaluation.critique}`,
  );
  return evaluation;
}

async function writeSpeech(
  options: {
    provider: MediaProvider;
    jobPath: string;
    totalScenes: number;
    onBeat?: (label: string) => Promise<void>;
  },
  scene: Scene,
) {
  await options.onBeat?.(`Scene ${scene.index}: spoken narration (~20 words / 8s)`);
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
  let seconds = 0;
  if (spoken) {
    await writeFile(speechFile, spoken);
    try {
      seconds = await mediaDuration(speechFile);
    } catch {
      seconds = 0;
    }
  }
  return { path: spoken ? speechFile : undefined, seconds };
}
