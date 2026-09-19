import type { CameraMotion, Scene } from "@/lib/agent/types";

/** L6 voice lock — calm engineer, ~140 wpm, fits an 8s clip. */
export const VOICE_PROFILE =
  "calm, clear, male voice with a neutral American accent. Warm baritone, steady pace around 140 words per minute. Professional and conversational, like a senior engineer explaining to a colleague. No uptalk, no vocal fry. Even tone, slight emphasis on part IDs. Natural pauses between sentences.";

/** L2/L6 shared look so every still is the same workshop, not a new set. */
export const STYLE_PREFIX =
  "Photoreal 16:9 documentary still. Same workshop throughout: warm workbench or living-room floor, natural indoor light, shallow depth of field, real adult assembler. How-to assembly video — not a drawing, not exploded CAD, no invented logos.";

export const CAMERA_MOTIONS: CameraMotion[] = [
  "slow_left_to_right",
  "slow_zoom_in",
  "slow_zoom_out",
  "static",
];

export function clipNarration(text: string, maxWords = 22) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

export function defaultCamera(index: number): CameraMotion {
  return CAMERA_MOTIONS[(Math.max(index, 1) - 1) % CAMERA_MOTIONS.length];
}

export function defaultSound(title: string) {
  return `quiet workshop, hands seating parts for "${title}", no music, no extra voices`;
}

export function motionPromptWithAudio(scene: Scene) {
  const voice = scene.voiceProfile || VOICE_PROFILE;
  const spoken = clipNarration(scene.narration);
  const camera = scene.cameraMotion ?? "slow_zoom_in";
  const sfx = scene.soundEffects || defaultSound(scene.title);
  return `${scene.motionPrompt}

Camera movement: ${camera}.
Sound effects: ${sfx}.
Narration spoken in a ${voice}:
"${spoken}"`;
}

export function framePromptWithStyle(scene: Scene) {
  const visual = scene.visualDescription || scene.framePrompt;
  return `${STYLE_PREFIX}
Use the attached manual figure as a general style and part-geometry guide, not a pixel overlay. Only the listed parts may appear.
Subject: a real adult assembling this step.
Action: ${scene.title}. ${visual}
Camera: eye-level ${scene.cameraMotion ?? "slow_zoom_in"}.`;
}

export function withDirectionDefaults(scene: Scene): Scene {
  return {
    ...scene,
    cameraMotion: scene.cameraMotion && CAMERA_MOTIONS.includes(scene.cameraMotion)
      ? scene.cameraMotion
      : defaultCamera(scene.index),
    voiceProfile: scene.voiceProfile || VOICE_PROFILE,
    soundEffects: scene.soundEffects || defaultSound(scene.title),
    visualDescription: scene.visualDescription || scene.framePrompt,
    narration: clipNarration(scene.narration, 28),
  };
}
