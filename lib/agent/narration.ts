import { LEAD_SECONDS, formatTimestamp } from "@/lib/agent/ffmpeg";
import { spokenLine } from "@/lib/agent/storyboard";
import type { Scene } from "@/lib/agent/types";

export function narrationScript(scene: Scene, totalScenes: number) {
  if (scene.steps) return spokenLine(scene);
  const warning = scene.warnings[0] ? ` Warning: ${scene.warnings[0].replace(/[.\s]+$/, "")}.` : "";
  return `Step ${scene.index} of ${totalScenes}. ${scene.title}. ${scene.narration}${warning}`;
}

/** Split a line into caption-sized pieces at sentence, then clause, boundaries. */
function captionChunks(text: string, maxChars = 84) {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    let rest = sentence;
    while (rest.length > maxChars) {
      const window = rest.slice(0, maxChars);
      const comma = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "));
      const cut = comma > maxChars * 0.4 ? comma + 1 : window.lastIndexOf(" ");
      const at = cut > 0 ? cut : maxChars;
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) chunks.push(rest);
  }
  return chunks;
}

function twoLines(text: string, maxLine = 44) {
  if (text.length <= maxLine) return text;
  const middle = Math.floor(text.length / 2);
  const before = text.lastIndexOf(" ", middle);
  const after = text.indexOf(" ", middle);
  const at =
    before === -1 ? after : after === -1 ? before : middle - before <= after - middle ? before : after;
  return at > 0 ? `${text.slice(0, at)}\n${text.slice(at + 1)}` : text;
}

export function buildCaptions(scenes: Scene[], durations: number[], totalScenes = scenes.length) {
  const vtt = ["WEBVTT", ""];
  const srt: string[] = [];
  let cursor = 0;
  let cue = 1;
  scenes.forEach((scene, i) => {
    const length = durations[i] ?? scene.durationSeconds ?? 8;
    const line = narrationScript(scene, totalScenes);
    const speech = Math.min(
      scene.speechSeconds && scene.speechSeconds > 0.5
        ? scene.speechSeconds
        : line.split(/\s+/).length / 2.5,
      Math.max(length - LEAD_SECONDS, 0.5),
    );
    const chunks = captionChunks(line);
    const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
    let at = cursor + LEAD_SECONDS;
    for (const chunk of chunks) {
      const span = (speech * chunk.length) / totalChars;
      const start = at;
      const end = at + span;
      at = end;
      const text = twoLines(chunk);
      vtt.push(`${formatTimestamp(start)} --> ${formatTimestamp(end)}`, text, "");
      srt.push(String(cue), `${formatTimestamp(start, ",")} --> ${formatTimestamp(end, ",")}`, text, "");
      cue += 1;
    }
    cursor += length;
  });
  return { vtt: vtt.join("\n"), srt: srt.join("\n") };
}

export function buildCaptionsVtt(scenes: Scene[], durations: number[]) {
  return buildCaptions(scenes, durations).vtt;
}
