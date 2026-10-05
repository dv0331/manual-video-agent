import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { motionPromptWithAudio } from "@/lib/agent/direction";
import { evaluateClip, evaluateScene } from "@/lib/agent/evaluate";
import { kenBurnsClip, mediaDuration, muxNarration } from "@/lib/agent/ffmpeg";
import { mapLimit } from "@/lib/agent/pool";
import { logProduction } from "@/lib/agent/production-log";
import { trace, traceFailure } from "@/lib/agent/trace";
import { FAST_CLIP_SECONDS, fastCut } from "@/lib/agent/fast";
import { demoProvider } from "@/lib/agent/providers/demo";
import type { MediaProvider } from "@/lib/agent/providers/types";
import type { AssemblyGraph, EvaluationScores, Scene, SceneResult } from "@/lib/agent/types";
import { MAX_RETRIES, MAX_VIDEO_RETRIES, SCENE_SECONDS } from "@/lib/agent/types";

const IMAGE_CONCURRENCY = Number(process.env.SCENE_CONCURRENCY ?? 8);

type Draft = {
  scene: Scene;
  framePath: string;
  clipPath: string;
  evaluation: EvaluationScores;
  speech: { path?: string; seconds: number };
  attempts: number;
};

export async function generateAllScenes(options: {
  provider: MediaProvider;
  scenes: Scene[];
  graph: AssemblyGraph;
  jobPath: string;
  onScene?: (done: number, total: number, label: string) => Promise<void>;
}): Promise<SceneResult[]> {
  const framesDir = path.join(options.jobPath, "frames");
  const clipsDir = path.join(options.jobPath, "clips");
  await mkdir(framesDir, { recursive: true });
  await mkdir(clipsDir, { recursive: true });

  let finishedStills = 0;
  const drafts = await mapLimit(options.scenes, IMAGE_CONCURRENCY, async (scene, index) => {
    const framePath = path.join(framesDir, `${scene.id}.png`);
    const clipPath = path.join(clipsDir, `${scene.id}.mp4`);
    const previousFigure = options.scenes[index - 1]?.figurePath;
    await trace(`Scene ${scene.index} still, voice, and judge starting`);
    const [evaluation, speech] = await Promise.all([
      generateStill({
        provider: options.provider,
        scene,
        graph: options.graph,
        jobPath: options.jobPath,
        previousFramePath: previousFigure,
        framePath,
      }).then(async (result) => {
        await trace(
          `Scene ${scene.index} still ${result.passed ? "passed" : "failed"} judge (${result.failureType})`,
        );
        return result;
      }),
      writeSpeech(options.provider, options.jobPath, scene, options.scenes.length).then(
        async (result) => {
          await trace(
            `Scene ${scene.index} voice ${result.path ? `ready ${result.seconds.toFixed(1)}s` : "missing"}`,
          );
          return result;
        },
      ),
    ]);
    finishedStills += 1;
    await options.onScene?.(
      finishedStills,
      options.scenes.length,
      `First takes ${finishedStills}/${options.scenes.length} — still, voice, and judge in parallel`,
    );
    return {
      scene,
      framePath,
      clipPath,
      evaluation,
      speech,
      attempts: 1,
    } satisfies Draft;
  });

  const retries = drafts.filter(
    (draft) => !draft.evaluation.passed && draft.evaluation.failureType === "visual",
  );
  if (!fastCut() && retries.length && MAX_RETRIES > 0) {
    await options.onScene?.(
      finishedStills,
      options.scenes.length,
      `Retaking ${retries.length} still${retries.length === 1 ? "" : "s"} from judge feedback`,
    );
    await mapLimit(retries, IMAGE_CONCURRENCY, async (draft) => {
      const rewritten = await options.provider.enhancePrompt(
        draft.scene,
        draft.evaluation.critique,
      );
      const takeB = path.join(framesDir, `${draft.scene.id}-take-b.png`);
      const evaluation = await generateStill({
        provider: options.provider,
        scene: rewritten,
        graph: options.graph,
        jobPath: options.jobPath,
        previousFramePath: draft.framePath,
        framePath: takeB,
      });
      draft.attempts = 2;
      if (betterStill(evaluation, draft.evaluation)) {
        draft.scene = rewritten;
        draft.evaluation = evaluation;
        await copyFile(takeB, draft.framePath);
      }
    });
  }

  await trace(
    fastCut()
      ? `Fast cut: encoding ${drafts.length} clip${drafts.length === 1 ? "" : "s"} in ${FAST_CLIP_SECONDS}s, target under 60s`
      : `Encoding ${drafts.length} clip${drafts.length === 1 ? "" : "s"} (progress stays at 90 until stitch)`,
  );
  const results = await mapLimit(drafts, fastCut() ? 2 : IMAGE_CONCURRENCY, async (draft) =>
    finishClip(options.provider, options.jobPath, options.scenes.length, draft),
  );

  return results;
}

export async function generateScene(options: {
  provider: MediaProvider;
  scene: Scene;
  graph: AssemblyGraph;
  jobPath: string;
  previousFramePath?: string;
  totalScenes: number;
  onBeat?: (label: string) => Promise<void>;
}): Promise<SceneResult> {
  const [result] = await generateAllScenes({
    provider: options.provider,
    scenes: [options.scene],
    graph: options.graph,
    jobPath: options.jobPath,
  });
  return result;
}

async function finishClip(
  provider: MediaProvider,
  jobPath: string,
  totalScenes: number,
  draft: Draft,
): Promise<SceneResult> {
  let { scene, evaluation } = draft;
  let durationSeconds = fastCut()
    ? FAST_CLIP_SECONDS
    : Math.max(SCENE_SECONDS, Math.ceil(draft.speech.seconds + 0.4));
  let motionSource: SceneResult["motionSource"] = "kenburns";
  let videoAttempts = 0;
  const videoPasses = fastCut() ? 1 : MAX_VIDEO_RETRIES + 1;

  for (videoAttempts = 1; videoAttempts <= videoPasses; videoAttempts++) {
    await trace(
      `Scene ${scene.index} Ken Burns encode starting (${durationSeconds}s, attempt ${videoAttempts})`,
    );
    const encodeStarted = Date.now();
    await kenBurnsClip({
      framePath: draft.framePath,
      outputPath: draft.clipPath,
      scene,
      totalScenes,
      seconds: durationSeconds,
      audioPath: draft.speech.path,
    });
    motionSource = "kenburns";
    await trace(
      `Scene ${scene.index} Ken Burns encode finished in ${Math.round((Date.now() - encodeStarted) / 1000)}s`,
    );

    if (process.env.SORA_WAIT === "1") {
      await trace(`Scene ${scene.index} waiting on motion model`);
      const soraPath = `${draft.clipPath}.sora-raw.mp4`;
      const animated = await provider.generateVideo({
        scene: { ...scene, motionPrompt: motionPromptWithAudio(scene) },
        framePath: draft.framePath,
        outputPath: soraPath,
        totalScenes,
      });
      if (animated) {
        motionSource = provider.name === "openai" ? "sora" : "veo";
        const motionSeconds = Number(process.env.OPENAI_VIDEO_SECONDS ?? 8);
        durationSeconds = [4, 8, 12].includes(motionSeconds) ? motionSeconds : 8;
        try {
          if (draft.speech.path) {
            await muxNarration({
              videoPath: soraPath,
              audioPath: draft.speech.path,
              outputPath: draft.clipPath,
              seconds: durationSeconds,
            });
          } else {
            await copyFile(soraPath, draft.clipPath);
          }
        } catch (error) {
          await traceFailure(
            `Scene ${scene.index} narration mix`,
            error,
            "keeping the spoken still",
          );
          motionSource = "kenburns";
          durationSeconds = Math.max(SCENE_SECONDS, Math.ceil(draft.speech.seconds + 0.4));
        }
      }
    }

    evaluation = await evaluateClip({
      still: evaluation,
      speechPath: draft.speech.path,
    });
    if (evaluation.passed || evaluation.failureType !== "audio") break;
    await logProduction(jobPath, `Scene ${scene.index} audio retry (keep still)`);
  }

  await logProduction(
    jobPath,
    `Scene ${scene.index} ${evaluation.passed ? "PASS" : "accepted"} type=${evaluation.failureType} motion=${motionSource} stillAttempts=${draft.attempts} videoAttempts=${videoAttempts}`,
  );

  return {
    scene: { ...scene, durationSeconds },
    framePath: draft.framePath,
    clipPath: draft.clipPath,
    attempts: draft.attempts,
    evaluation,
    motionSource,
    durationSeconds,
  };
}

function betterStill(candidate: EvaluationScores, current: EvaluationScores) {
  if (candidate.passed && !current.passed) return true;
  if (candidate.passed === current.passed) {
    const c = (candidate.partIdentity ?? 0) + (candidate.cheapGate ?? candidate.similarity ?? 0);
    const a = (current.partIdentity ?? 0) + (current.cheapGate ?? current.similarity ?? 0);
    return c > a;
  }
  return false;
}

async function generateStill(options: {
  provider: MediaProvider;
  scene: Scene;
  graph: AssemblyGraph;
  jobPath: string;
  previousFramePath?: string;
  framePath: string;
}): Promise<EvaluationScores> {
  if (fastCut()) {
    if (!options.scene.figurePath) {
      throw new Error(`No figure available for ${options.scene.title}`);
    }
    await copyFile(options.scene.figurePath, options.framePath);
    await trace(`Scene ${options.scene.index} manual figure, skip image model and judge`);
    const evaluation = await demoProvider.evaluateFrame({
      scene: options.scene,
      frame: { mimeType: "image/png", base64: "" },
      knownPartIds: options.graph.parts.map((part) => part.id),
    });
    await logProduction(
      options.jobPath,
      `Scene ${options.scene.index} still fast ${evaluation.passed ? "PASS" : "FAIL"} ${evaluation.critique}`,
    );
    return evaluation;
  }

  const reference = options.scene.figurePath
    ? {
        mimeType: "image/png",
        base64: (await readFile(options.scene.figurePath)).toString("base64"),
      }
    : undefined;
  const generated = await options.provider.generateFrame({
    scene: options.scene,
    reference,
  });
  if (generated) {
    await writeFile(options.framePath, generated);
  } else if (options.scene.figurePath) {
    await copyFile(options.scene.figurePath, options.framePath);
  } else {
    throw new Error(`No figure available for ${options.scene.title}`);
  }

  const evaluation = await evaluateScene({
    provider: options.provider,
    scene: options.scene,
    framePath: options.framePath,
    previousFramePath: options.previousFramePath,
    graph: options.graph,
  });
  await logProduction(
    options.jobPath,
    `Scene ${options.scene.index} still ${evaluation.passed ? "PASS" : "FAIL"} cheap=${(evaluation.cheapGate ?? 0).toFixed(2)} parts=${evaluation.partIdentity.toFixed(2)} ${evaluation.critique}`,
  );
  return evaluation;
}

async function writeSpeech(
  provider: MediaProvider,
  jobPath: string,
  scene: Scene,
  totalScenes: number,
) {
  const speechDir = path.join(jobPath, "speech");
  await mkdir(speechDir, { recursive: true });
  const speechPath = path.join(speechDir, `${scene.id}.mp3`);
  const speaker = fastCut() ? demoProvider : provider;
  let spoken = await speaker.generateSpeech({ scene, totalScenes });
  if (!spoken && speaker.name !== "demo") {
    spoken = await demoProvider.generateSpeech({ scene, totalScenes });
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
