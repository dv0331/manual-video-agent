import type { AssemblyGraph, Scene } from "@/lib/agent/types";

export function humanFramePrompt(graph: AssemblyGraph, scene: Pick<Scene, "title" | "narration" | "allowedPartIds" | "warnings">) {
  const parts = scene.allowedPartIds.length
    ? `Only these parts may appear: ${scene.allowedPartIds.join(", ")}.`
    : "Only the parts named in the instruction may appear.";
  const warning = scene.warnings[0] ? `Visible caution if relevant: ${scene.warnings[0]}.` : "";
  return `Photoreal 16:9 documentary still of a real adult assembling "${graph.title}" on a workbench or living-room floor.
The person is performing this exact step: ${scene.title}.
Action: ${scene.narration}
${parts}
${warning}
Show real hands, real tools named in the step, and the product in a half-built state that matches the step.
Natural indoor lighting, shallow depth of field, how-to assembly video still — not a drawing, not an exploded CAD view, no invented logos or extra hardware.`;
}

export function humanMotionPrompt(graph: AssemblyGraph, scene: Pick<Scene, "title" | "narration" | "allowedPartIds">) {
  return `A real person assembling "${graph.title}".
Step: ${scene.title}. ${scene.narration}
Continuous handheld documentary shot of hands fitting the real parts. Slow, careful assembly motion.
Do not add hardware, fasteners, or tools that are not named. No on-screen text, no jump cuts, no cartoon style.
Allowed parts: ${scene.allowedPartIds.join(", ") || "only those in the instruction"}.`;
}

export function applyHumanAssemblyDirection(graph: AssemblyGraph, scene: Scene): Scene {
  return {
    ...scene,
    startFrameStrategy: "human-assembly",
    framePrompt: humanFramePrompt(graph, scene),
    motionPrompt: humanMotionPrompt(graph, scene),
  };
}
