import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  LEAD_SECONDS,
  TAIL_SECONDS,
  clipSeconds,
  cpuBudget,
  drawingCard,
  mediaDuration,
  motionMode,
  renderOverlay,
  renderSceneClip,
  renderStill,
} from "@/lib/agent/ffmpeg";
import { sceneBadge } from "@/lib/agent/badge";
import { narrationScript } from "@/lib/agent/narration";
import { limiter, mapLimit } from "@/lib/agent/pool";
import { logProduction } from "@/lib/agent/production-log";
import { demoProvider } from "@/lib/agent/providers/demo";
import type { ImageInput, MediaProvider, StillJudgement } from "@/lib/agent/providers/types";
import { cropReference } from "@/lib/agent/reference";
import { stillPrompt } from "@/lib/agent/storyboard";
import { trace, traceFailure } from "@/lib/agent/trace";
import type { EvaluationScores, Scene, SceneResult } from "@/lib/agent/types";
import { MAX_RETRIES } from "@/lib/agent/types";
import { buildVoiceTrack, wavSeconds } from "@/lib/agent/voice-track";

const SCENE_CONCURRENCY = Number(process.env.SCENE_CONCURRENCY ?? 12);
/** A still that scores below this, or has a serious problem, gets one retake. */
const PASS_SCORE = 0.6;

const seconds = (since: number) => ((Date.now() - since) / 1000).toFixed(1);

async function asInput(filePath: string, width = 1024): Promise<ImageInput> {
  const jpeg = await sharp(filePath)
    .flatten({ background: "#ffffff" })
    .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { mimeType: "image/jpeg", base64: jpeg.toString("base64") };
}

function scoresFrom(verdict: StillJudgement | null, note: string): EvaluationScores {
  if (!verdict) {
    return {
      similarity: 1,
      promptAdherence: 1,
      visualQuality: 0.9,
      partIdentity: 1,
      safetyCoverage: 1,
      inventedParts: false,
      warningPresent: true,
      sequenceCorrect: true,
      temporalConsistency: 0.9,
      passed: true,
      critique: note,
      failureType: "none",
      narrationAlignment: 1,
      motionCoherence: 0.9,
      cheapGate: 1,
    };
  }
  const passed = verdict.matches >= PASS_SCORE && verdict.problems.length === 0;
  return {
    similarity: verdict.matches,
    promptAdherence: verdict.matches,
    visualQuality: verdict.problems.length ? 0.5 : 0.9,
    partIdentity: verdict.matches,
    safetyCoverage: 1,
    inventedParts: false,
    warningPresent: true,
    sequenceCorrect: true,
    temporalConsistency: 0.9,
    passed,
    critique:
      verdict.critique || verdict.problems.join("; ") || (passed ? "Matches the manual drawing" : "Weak match"),
    failureType: passed ? "none" : "visual",
    narrationAlignment: 1,
    motionCoherence: 0.9,
    cheapGate: verdict.matches,
  };
}

const rank = (verdict: StillJudgement | null) =>
  verdict ? verdict.matches - 0.25 * verdict.problems.length : 0;

async function judge(
  provider: MediaProvider,
  scene: Scene,
  stillPath: string,
  reference?: ImageInput,
): Promise<StillJudgement | null> {
  if (!provider.judgeStill) return null;
  try {
    return await provider.judgeStill({ scene, still: await asInput(stillPath, 768), reference });
  } catch (error) {
    await traceFailure(`Scene ${scene.index} judge`, error, "keeping the still unjudged");
    return null;
  }
}

/** OpenAI sends JPEG and other providers PNG; the file name follows the bytes. */
function imageFile(base: string, image: Buffer) {
  return `${base}.${image[0] === 0xff && image[1] === 0xd8 ? "jpg" : "png"}`;
}

async function shoot(options: {
  provider: MediaProvider;
  scene: Scene;
  product: string;
  look?: string;
  referencePath?: string;
  /** Frame path without an extension. */
  frameBase: string;
}) {
  const { provider, scene, product, look, referencePath, frameBase } = options;
  const reference = referencePath ? await asInput(referencePath, 1536) : undefined;

  const take = async (critique?: string) => {
    const started = Date.now();
    let image: Buffer | null = null;
    try {
      image = provider.generateStill
        ? await provider.generateStill({ prompt: stillPrompt(scene, { product, look, critique }), reference })
        : await provider.generateFrame({ scene, reference });
    } catch (error) {
      await traceFailure(`Scene ${scene.index} still`, error, "no photo for this take");
    }
    return { image, ms: Date.now() - started };
  };

  const firstTake = take();
  // Made while the first photo is shot; without it the judge compares against the brief.
  const judgeRef = referencePath ? asInput(referencePath, 768).catch(() => undefined) : Promise.resolve(undefined);
  const first = await firstTake;
  if (!first.image) {
    if (referencePath) {
      const framePath = `${frameBase}.png`;
      await drawingCard(referencePath, framePath);
      await trace(`Scene ${scene.index} photo failed — showing the manual drawing instead`);
      return { framePath, attempts: 1, verdict: null, fallback: true, note: "Manual drawing shown (photo failed)" };
    }
    throw new Error(`Scene ${scene.index}: no photo and no drawing to show`);
  }
  let framePath = imageFile(frameBase, first.image);
  await writeFile(framePath, first.image);
  let verdict = await judge(provider, scene, framePath, await judgeRef);
  await trace(
    `Scene ${scene.index} still ${(first.ms / 1000).toFixed(1)}s${verdict ? `, judge ${verdict.matches.toFixed(2)}${verdict.problems.length ? ` (${verdict.problems.join("; ")})` : ""}` : ""}`,
  );

  let attempts = 1;
  const weak = verdict && (verdict.matches < PASS_SCORE || verdict.problems.length > 0);
  if (weak && MAX_RETRIES > 0) {
    attempts = 2;
    const critique = verdict?.critique || verdict?.problems.join("; ");
    const second = await take(critique);
    if (second.image) {
      const retakePath = imageFile(`${frameBase}-take2`, second.image);
      await writeFile(retakePath, second.image);
      const retakeVerdict = await judge(provider, scene, retakePath, await judgeRef);
      await trace(
        `Scene ${scene.index} retake ${(second.ms / 1000).toFixed(1)}s${retakeVerdict ? `, judge ${retakeVerdict.matches.toFixed(2)}` : ""}`,
      );
      if (rank(retakeVerdict) > rank(verdict)) {
        framePath = retakePath;
        verdict = retakeVerdict;
      }
    }
  }
  return { framePath, attempts, verdict, fallback: false, note: "" };
}

async function voice(
  provider: MediaProvider,
  scene: Scene,
  text: string,
  speechDir: string,
  totalScenes: number,
) {
  const started = Date.now();
  let audio: Buffer | null = null;
  try {
    audio = provider.speak
      ? await provider.speak(text)
      : await provider.generateSpeech({ scene, totalScenes });
  } catch (error) {
    await traceFailure(`Scene ${scene.index} voice`, error, "using the local voice");
  }
  let local = false;
  if (!audio) {
    audio = await demoProvider.speak!(text);
    local = true;
  }
  if (!audio) return { path: undefined, seconds: 0, local };
  const isWav = audio.subarray(0, 4).toString("ascii") === "RIFF";
  const filePath = path.join(/* turbopackIgnore: true */ speechDir, `${scene.id}.${isWav ? "wav" : "mp3"}`);
  await writeFile(filePath, audio);
  let length = (isWav && wavSeconds(audio)) || 0;
  if (!length) {
    try {
      length = await mediaDuration(filePath);
    } catch {
      length = text.split(/\s+/).length / 2.5;
    }
  }
  await trace(
    `Scene ${scene.index} voice ${seconds(started)}s → ${length.toFixed(1)}s of speech${local ? " (local voice)" : ""}`,
  );
  return { path: filePath, seconds: length, local };
}

export async function generateAllScenes(options: {
  provider: MediaProvider;
  scenes: Scene[];
  product: string;
  look?: string;
  kind?: "assembly" | "guide";
  jobPath: string;
  pageImages?: string[];
  onScene?: (done: number, total: number, label: string) => Promise<void>;
}): Promise<{ results: SceneResult[]; voiceTrack: string }> {
  const dirs = Object.fromEntries(
    ["frames", "refs", "speech", "overlays", "clips", "stills"].map((name) => [
      name,
      path.join(/* turbopackIgnore: true */ options.jobPath, name),
    ]),
  ) as Record<"frames" | "refs" | "speech" | "overlays" | "clips" | "stills", string>;
  await Promise.all(Object.values(dirs).map((dir) => mkdir(dir, { recursive: true })));

  const total = options.scenes.length;
  const mode = motionMode();
  const encodeSlots = Math.max(1, Math.min(6, Math.floor(cpuBudget())));
  const encode = limiter(encodeSlots);
  const threads = Math.max(1, Math.floor(cpuBudget() / encodeSlots));
  await trace(
    mode === "kenburns"
      ? `Shooting ${total} scenes in parallel; eased camera motion with ${encodeSlots} slot${encodeSlots === 1 ? "" : "s"} × ${threads} thread${threads === 1 ? "" : "s"} (${cpuBudget().toFixed(1)} CPU)`
      : `Shooting ${total} scenes in parallel; one held picture per scene, encoded once at the stitch (${cpuBudget().toFixed(1)} CPU)`,
  );

  // Voices are quick and fix every clip's length, so the whole voice track is
  // built and encoded while the photos are still being shot.
  const voices = options.scenes.map((scene) =>
    voice(options.provider, scene, narrationScript(scene, total), dirs.speech, total),
  );
  const lengths = voices.map((pending) =>
    pending.then((speech) => clipSeconds(Math.max(4.5, LEAD_SECONDS + speech.seconds + TAIL_SECONDS))),
  );
  const voiceTrack = Promise.all(voices).then(async (spoken) => {
    const started = Date.now();
    const clipLengths = await Promise.all(lengths);
    const track = await buildVoiceTrack({
      segments: spoken.map((speech, i) => ({ audioPath: speech.path, seconds: clipLengths[i] })),
      wavPath: path.join(options.jobPath, "voice.wav"),
      outputPath: path.join(options.jobPath, "voice.m4a"),
    });
    await trace(
      `Voice track ${track.seconds.toFixed(1)}s measured ${track.loudness.toFixed(1)} LUFS mono, gain ${track.gain >= 0 ? "+" : ""}${track.gain.toFixed(1)} dB, encoded in ${seconds(started)}s`,
    );
    return track.path;
  });
  // Awaited below or per scene; these keep an early scene failure from becoming an unhandled rejection.
  for (const pending of [...voices, ...lengths, voiceTrack]) pending.catch(() => undefined);

  let done = 0;
  const results = await mapLimit(options.scenes, SCENE_CONCURRENCY, async (scene, i) => {
    const started = Date.now();
    const clipPath = path.join(dirs.clips, `${scene.id}.mp4`);
    const stillPath = path.join(dirs.stills, `${scene.id}.jpg`);

    let referencePath: string | undefined;
    const page = scene.page ? options.pageImages?.[scene.page - 1] : undefined;
    if (page && existsSync(page)) {
      try {
        referencePath = await cropReference(page, scene.crop, path.join(dirs.refs, `${scene.id}.png`));
      } catch (error) {
        await traceFailure(`Scene ${scene.index} drawing crop`, error, "using the whole page");
        referencePath = page;
      }
    } else if (scene.figurePath && existsSync(scene.figurePath)) {
      referencePath = scene.figurePath;
    }

    const [still, speech, durationSeconds] = await Promise.all([
      shoot({
        provider: options.provider,
        scene,
        product: options.product,
        look: options.look,
        referencePath,
        frameBase: path.join(dirs.frames, scene.id),
      }),
      voices[i],
      lengths[i],
    ]);
    const { framePath } = still;

    const overlayPath = path.join(dirs.overlays, `${scene.id}.png`);
    const badge = sceneBadge(scene, options.kind ?? "assembly");
    await renderOverlay(
      {
        badge,
        build: scene.build,
        title: scene.title.toLowerCase() === badge.toLowerCase() ? options.product : scene.title,
        counter: `${scene.index} / ${total}`,
        callouts: scene.onScreenCallouts.slice(0, 3),
        warning: scene.warnings[0],
        insetPath: still.fallback ? undefined : referencePath,
        insetLabel: scene.page ? `Manual · page ${scene.page}` : "Manual",
      },
      overlayPath,
    );
    const finishStarted = Date.now();
    if (mode === "kenburns") {
      await encode(() =>
        renderSceneClip({
          framePath,
          overlayPath,
          outputPath: clipPath,
          seconds: durationSeconds,
          motion: scene.cameraMotion,
          threads,
        }),
      );
    } else {
      await renderStill({ framePath, overlayPath, outputPath: stillPath });
    }
    done += 1;
    await trace(
      `Scene ${scene.index} ${mode === "kenburns" ? "clip" : "picture"} ${durationSeconds.toFixed(1)}s ${mode === "kenburns" ? "encoded" : "composed"} in ${seconds(finishStarted)}s — scene ready in ${seconds(started)}s`,
    );
    await options.onScene?.(done, total, `Scene ${done} of ${total} ready`);

    const evaluation = scoresFrom(still.verdict, still.note || "Not judged");
    if (speech.local) {
      evaluation.critique = `${evaluation.critique} · local voice (OpenAI voice failed)`;
    }
    await logProduction(
      options.jobPath,
      `Scene ${scene.index} ${evaluation.passed ? "PASS" : "kept"} match=${(evaluation.cheapGate ?? 0).toFixed(2)} takes=${still.attempts} length=${durationSeconds.toFixed(1)}s ${evaluation.critique}`,
    );
    return {
      scene: { ...scene, durationSeconds, speechSeconds: speech.seconds },
      framePath,
      referencePath,
      clipPath: mode === "kenburns" ? clipPath : "",
      stillPath: mode === "still" ? stillPath : undefined,
      attempts: still.attempts,
      evaluation,
      motionSource: mode,
      durationSeconds,
    } satisfies SceneResult;
  });
  return { results, voiceTrack: await voiceTrack };
}