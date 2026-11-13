import type { AssemblyGraph, CameraMotion, Scene } from "@/lib/agent/types";

export const MAX_STORYBOARD_SCENES = 12;

export interface StoryboardScene {
  title: string;
  build: string;
  steps: number[];
  page: number;
  cropTop: number;
  cropBottom: number;
  narration: string;
  visual: string;
  callouts: string[];
  warning: string;
}

export interface Storyboard {
  product: string;
  documentId: string;
  kind: "assembly" | "guide";
  summary: string;
  /** Colors and materials every photo must share. */
  look: string;
  tools: string[];
  parts: Array<{ id: string; name: string; qty: number }>;
  warnings: string[];
  scenes: StoryboardScene[];
}

export interface StoryboardPage {
  page: number;
  text: string;
  dataUrl: string;
}

const stringArray = { type: "array", items: { type: "string" } } as const;

export const STORYBOARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["product", "documentId", "kind", "summary", "look", "tools", "parts", "warnings", "scenes"],
  properties: {
    product: { type: "string" },
    documentId: { type: "string" },
    kind: { type: "string", enum: ["assembly", "guide"] },
    summary: { type: "string" },
    look: { type: "string" },
    tools: stringArray,
    parts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "qty"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          qty: { type: "integer" },
        },
      },
    },
    warnings: stringArray,
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "build",
          "steps",
          "page",
          "cropTop",
          "cropBottom",
          "narration",
          "visual",
          "callouts",
          "warning",
        ],
        properties: {
          title: { type: "string" },
          build: { type: "string" },
          steps: { type: "array", items: { type: "integer" } },
          page: { type: "integer" },
          cropTop: { type: "number" },
          cropBottom: { type: "number" },
          narration: { type: "string" },
          visual: { type: "string" },
          callouts: stringArray,
          warning: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You direct short narrated how-to videos made from product manuals.
You read every page image, work out the real procedure, and write a storyboard that a narrator reads aloud over one photo per scene.
Never invent parts, tools, quantities, or steps that the pages do not show.`;

function instructions(sourceName: string, pageCount: number) {
  return `Manual file: "${sourceName}". ${pageCount} page images follow in order, each after its page label and the page's text layer.
The text layer is often only part numbers or warnings in many languages. Trust the drawings first.

Write the storyboard.
1. Cover the whole procedure in order. A scene shows the numbered steps drawn on one page (usually one or two, at most three). Never merge steps from different pages.
2. If there is a parts or hardware page, start with one "Before you start" scene from that page that names the tools and the main parts (steps = []).
3. Skip covers, blank pages, and pages of multilingual warning text as scenes, but put their warnings in "warnings" and in the narration of the scene they apply to.
4. If the manual holds more than one build (for example a half-round and a rectangular table), set "build" to a short name for each build and cover all of them when the total stays within ${MAX_STORYBOARD_SCENES} scenes; otherwise follow the first build. The first scene of each build names it in the narration. Use "" for build when there is only one.
5. If the manual shows mirrored alternatives (a left- or right-hand door), follow the first and say once that the other side mirrors it. Skip the duplicate pages.
6. At most ${MAX_STORYBOARD_SCENES} scenes.
7. page is the 1-based page where the scene's drawings are. cropTop and cropBottom are the vertical span of that page that shows only this scene's steps, from 0 (top edge) to 1 (bottom edge), with a little margin. Use 0 and 1 for the whole page.
8. narration is what the narrator says: one to three short, complete sentences, 18 to 45 words. Plain spoken English for a beginner: what to do, with which parts and tool, and how to tell it is right. Describe parts in words ("the four long bolts"); do not read part numbers aloud. No step numbers, no "in this step".
9. visual is a brief for one single photo of this scene (no split screens, no insets): the product's state at the end of the scene, which side is up, where the hands are, which tool, and the camera angle. It must match the drawing (shape, number of legs, orientation).
10. callouts are zero to three short on-screen labels such as "4× 105102", "Allen key", or "2 people".
11. warning is a short caution when the page shows one (a crossed-out panel, a two-person icon, protect the surface), otherwise "".
12. kind is "assembly" for step-by-step instructions and "guide" for an article or safety notice. For a guide, follow its sections in order (steps = []) and use the pages with drawings as references.
13. look is one short phrase that fixes the product's colors and materials for every photo, for example "white steel frame and white tabletop" or "white-stained oak veneer with matte white knobs". Use the finish the manual names or shows; otherwise choose its most common finish. Every scene must use this look.`;
}

export function storyboardMessages(input: {
  sourceName: string;
  pages: StoryboardPage[];
}) {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [{ type: "text", text: instructions(input.sourceName, input.pages.length) }];
  for (const page of input.pages) {
    const text = page.text.replace(/\s+/g, " ").trim().slice(0, 600);
    content.push({ type: "text", text: `Page ${page.page}. Text layer: ${text || "(none)"}` });
    content.push({ type: "image_url", image_url: { url: page.dataUrl, detail: "high" } });
  }
  return [
    { role: "system" as const, content: SYSTEM },
    { role: "user" as const, content },
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function sentence(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

export function normalizeStoryboard(raw: Storyboard, pageCount: number): Storyboard {
  const scenes = (raw.scenes ?? [])
    .filter((scene) => scene && scene.narration?.trim())
    .slice(0, MAX_STORYBOARD_SCENES)
    .map((scene) => {
      let top = clamp(scene.cropTop, 0, 1);
      let bottom = clamp(scene.cropBottom, 0, 1);
      if (bottom - top < 0.2) {
        top = 0;
        bottom = 1;
      }
      return {
        title: scene.title?.trim() || "Assembly step",
        build: scene.build?.trim() ?? "",
        steps: (scene.steps ?? []).filter((n) => Number.isInteger(n) && n > 0),
        page: clamp(Math.round(scene.page), 1, Math.max(pageCount, 1)),
        cropTop: top,
        cropBottom: bottom,
        narration: sentence(scene.narration),
        visual: scene.visual?.trim() ?? "",
        callouts: (scene.callouts ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 3),
        warning: scene.warning?.trim() ?? "",
      };
    });
  return {
    product: raw.product?.trim() || "Assembly",
    documentId: raw.documentId?.trim() ?? "",
    kind: raw.kind === "guide" ? "guide" : "assembly",
    summary: raw.summary?.trim() ?? "",
    look: raw.look?.trim() ?? "",
    tools: (raw.tools ?? []).map((t) => t.trim()).filter(Boolean),
    parts: (raw.parts ?? []).filter((p) => p?.id),
    warnings: (raw.warnings ?? []).map((w) => w.trim()).filter(Boolean),
    scenes,
  };
}

export function stepLabel(steps: number[]) {
  if (!steps.length) return "";
  if (steps.length === 1) return `Step ${steps[0]}`;
  const sorted = [...steps].sort((a, b) => a - b);
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `Steps ${sorted[0]} to ${sorted.at(-1)}`;
  return `Steps ${sorted.slice(0, -1).join(", ")} and ${sorted.at(-1)}`;
}

export function spokenLine(scene: Pick<Scene, "steps" | "narration">) {
  const label = stepLabel(scene.steps ?? []);
  return label ? `${label}. ${scene.narration}` : scene.narration;
}

const MOTIONS: CameraMotion[] = [
  "slow_zoom_in",
  "slow_left_to_right",
  "slow_zoom_out",
  "slow_right_to_left",
];

export function scenesFromStoryboard(board: Storyboard): Scene[] {
  const partIds = board.parts.map((part) => part.id);
  return board.scenes.map((scene, i) => ({
    id: `scene-${String(i + 1).padStart(2, "0")}`,
    index: i + 1,
    title: scene.title,
    narration: scene.narration,
    onScreenCallouts: scene.callouts,
    motionPrompt: "",
    framePrompt: scene.visual,
    visualDescription: scene.visual,
    startFrameStrategy: "human-assembly",
    warnings: scene.warning ? [scene.warning] : [],
    allowedPartIds: partIds,
    cameraMotion: MOTIONS[i % MOTIONS.length],
    steps: scene.steps,
    build: scene.build || undefined,
    page: scene.page,
    crop: { top: scene.cropTop, bottom: scene.cropBottom },
  }));
}

export function stillPrompt(scene: Scene, options: { product: string; look?: string; critique?: string }) {
  const { product, look, critique } = options;
  return [
    "Photoreal photo for a how-to assembly video. Wide 16:9 framing with the whole action in frame.",
    `Product: ${product}${scene.build ? ` (${scene.build})` : ""}.`,
    look ? `Finish, identical in every shot of this video: ${look}.` : "",
    `Moment: ${scene.title}. ${scene.visualDescription || scene.narration}`,
    "The attached image is the official manual drawing for this moment. Match it exactly: the same parts and shapes, the same number of legs, rails, and panels, the same side up, and the hardware in the same places. Do not add parts, screws, or tools that the drawing does not show.",
    "Look: a bright, tidy home with a light wood floor and a pale rug, soft daylight, true-to-life colors, sharp focus on the hands and the parts. People wear plain navy t-shirts; show hands and forearms and keep faces out of frame. Hands have five fingers and hold tools naturally.",
    "No text, letters, numbers, arrows, labels, logos, diagrams, inset circles, or split screens anywhere in the image.",
    critique ? `Fix this from the last attempt: ${critique}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function storyboardToGraph(board: Storyboard): AssemblyGraph {
  return {
    title: board.product,
    documentId: board.documentId || undefined,
    tools: board.tools,
    parts: board.parts,
    steps: board.scenes
      .filter((scene) => scene.steps.length)
      .map((scene, i) => ({
        index: scene.steps[0] ?? i + 1,
        title: scene.title,
        instruction: scene.narration,
        figureRef: `Page ${scene.page}`,
        fasteners: scene.callouts,
        tools: [],
        warnings: scene.warning ? [scene.warning] : [],
      })),
    notes: [board.summary, ...board.warnings].filter(Boolean),
  };
}
