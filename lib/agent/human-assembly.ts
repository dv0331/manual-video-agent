import {
  STYLE_PREFIX,
  VOICE_PROFILE,
  defaultCamera,
  defaultSound,
  withDirectionDefaults,
} from "@/lib/agent/direction";
import type { AssemblyGraph, Scene } from "@/lib/agent/types";

export function humanFramePrompt(
  graph: AssemblyGraph,
  scene: Pick<
    Scene,
    "title" | "narration" | "allowedPartIds" | "warnings" | "cameraMotion" | "visualDescription"
  >,
) {
  const parts = scene.allowedPartIds.length
    ? `Only these parts may appear: ${scene.allowedPartIds.join(", ")}.`
    : "Only the parts named in the instruction may appear.";
  const warning = scene.warnings[0]
    ? `Visible caution if relevant: ${scene.warnings[0]}.`
    : "";
  const visual = scene.visualDescription || scene.narration;
  return `${STYLE_PREFIX}
Product: "${graph.title}".
The person is performing this exact step: ${scene.title}.
Action: ${visual}
${parts}
${warning}
Camera: eye-level ${scene.cameraMotion ?? "slow_zoom_in"}.
Show real hands, real tools named in the step, and the product in a half-built state that matches the step.`;
}

export function humanMotionPrompt(
  graph: AssemblyGraph,
  scene: Pick<Scene, "title" | "narration" | "allowedPartIds" | "cameraMotion" | "soundEffects">,
) {
  const camera = scene.cameraMotion ?? "slow_zoom_in";
  const sfx = scene.soundEffects || defaultSound(scene.title);
  return `A real adult assembling "${graph.title}".
Step: ${scene.title}. ${scene.narration}
Continuous documentary shot. Camera movement: ${camera}.
Sound effects: ${sfx}.
Hands fit only the real parts. Do not add hardware, fasteners, or tools that are not named. No on-screen text, no jump cuts, no cartoon style.
Allowed parts: ${scene.allowedPartIds.join(", ") || "only those in the instruction"}.`;
}

export function applyHumanAssemblyDirection(graph: AssemblyGraph, scene: Scene): Scene {
  const directed = withDirectionDefaults({
    ...scene,
    startFrameStrategy: "human-assembly",
    cameraMotion: scene.cameraMotion ?? defaultCamera(scene.index),
    voiceProfile: scene.voiceProfile || VOICE_PROFILE,
  });
  return {
    ...directed,
    framePrompt: humanFramePrompt(graph, directed),
    motionPrompt: humanMotionPrompt(graph, directed),
  };
}
