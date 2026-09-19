import { clipNarration } from "@/lib/agent/direction";
import type { Scene } from "@/lib/agent/types";

export function narrationScript(scene: Scene, totalScenes: number) {
  const warning = scene.warnings[0]
    ? ` Warning: ${clipNarration(scene.warnings[0], 12)}.`
    : "";
  const body = clipNarration(`${scene.title}. ${scene.narration}`, 20);
  return `Step ${scene.index} of ${totalScenes}. ${body}${warning}`;
}

export function buildCaptionsVtt(
  scenes: Scene[],
  durations: number[],
) {
  const lines = ["WEBVTT", ""];
  let cursor = 0;
  scenes.forEach((scene, i) => {
    const length = durations[i] ?? scene.durationSeconds ?? 8;
    const start = formatVtt(cursor);
    cursor += length;
    const end = formatVtt(cursor);
    lines.push(
      `${start} --> ${end}`,
      narrationScript(scene, scenes.length),
      "",
    );
  });
  return lines.join("\n");
}

function formatVtt(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.000`;
}
