import type { Scene } from "@/lib/agent/types";

/** The label a scene carries in the film and in the chapter list. */
export function sceneBadge(scene: Pick<Scene, "steps" | "index">, kind: "assembly" | "guide") {
  const steps = [...(scene.steps ?? [])].sort((a, b) => a - b);
  if (!steps.length) {
    if (kind === "guide") return `PART ${scene.index}`;
    return scene.index === 1 ? "BEFORE YOU START" : "GOOD TO KNOW";
  }
  if (steps.length === 1) return `STEP ${steps[0]}`;
  const contiguous = steps.every((n, i) => i === 0 || n === steps[i - 1] + 1);
  return contiguous ? `STEPS ${steps[0]}–${steps.at(-1)}` : `STEPS ${steps.join(", ")}`;
}
