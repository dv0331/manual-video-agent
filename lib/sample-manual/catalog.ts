import path from "node:path";
import { SAMPLE_CARDS } from "@/lib/sample-manual/cards";
import { sampleFilmReady } from "@/lib/sample-manual/films";
import { SAMPLE_GRAPH, SAMPLE_MANUAL_TEXT } from "@/lib/sample-manual/graph";
import type { AssemblyGraph } from "@/lib/agent/types";

export interface SampleManual {
  id: string;
  title: string;
  subtitle: string;
  attribution: string;
  thumb: string;
  pdfPublicPath: string;
  pdfPath: string;
  pagesDir?: string;
  figuresDir?: string;
  graph: AssemblyGraph;
  text: string;
}

const root = process.cwd();

export const KALLAX_GRAPH: AssemblyGraph = {
  title: "IKEA KALLAX shelf unit — assembly",
  documentId: "AA-1055145",
  tools: ["Phillips screwdriver", "Rubber mallet"],
  parts: [
    { id: "SIDE", name: "Side panel", qty: 2 },
    { id: "TOP", name: "Top / bottom panel", qty: 2 },
    { id: "SHELF", name: "Shelf", qty: 4 },
    { id: "BACK", name: "Back panel", qty: 1 },
    { id: "DOWEL", name: "Wooden dowel", qty: 8 },
    { id: "CAM", name: "Cam lock / locking screw", qty: 8 },
    { id: "WALL", name: "Wall attachment hardware", qty: 1 },
  ],
  steps: [
    {
      index: 1,
      title: "Insert dowels into the side panels",
      instruction:
        "Lay the side panels flat. Push wooden dowels into the marked holes. Do not force them past flush.",
      figureRef: "Page 2",
      fasteners: ["DOWEL"],
      tools: [],
      warnings: [],
    },
    {
      index: 2,
      title: "Fit locking screws in the top and bottom",
      instruction:
        "Thread the cam-lock screws into the top and bottom panels at the factory marks. Seat them fully.",
      figureRef: "Page 3",
      fasteners: ["CAM"],
      tools: ["Phillips screwdriver"],
      warnings: [],
    },
    {
      index: 3,
      title: "Join the first side to the top panel",
      instruction:
        "Stand the first side panel. Align dowels with the top panel holes and press the joint closed. Turn the cam locks to capture the screws.",
      figureRef: "Page 4",
      fasteners: ["CAM", "DOWEL"],
      tools: ["Phillips screwdriver"],
      warnings: [],
    },
    {
      index: 4,
      title: "Close the box with the remaining side and bottom",
      instruction:
        "Fit the bottom panel and the second side the same way. Check the box is square before tightening the last cams.",
      figureRef: "Page 5",
      fasteners: ["CAM"],
      tools: ["Phillips screwdriver"],
      warnings: [],
    },
    {
      index: 5,
      title: "Slide in the shelves",
      instruction:
        "Tilt each shelf into the cube openings and lower it onto the supports. Do not stand on the unit.",
      figureRef: "Page 6",
      fasteners: ["SHELF"],
      tools: [],
      warnings: [],
    },
    {
      index: 6,
      title: "Attach the unit to the wall",
      instruction:
        "Fix the supplied wall attachment bracket. Use wall plugs rated for your wall type.",
      figureRef: "Warning page",
      fasteners: ["WALL"],
      tools: ["Phillips screwdriver"],
      warnings: [
        "Serious injury can occur from tip-over. This furniture must be used with the wall attachment device.",
      ],
    },
  ],
  notes: [
    "Official IKEA KALLAX assembly instructions used as a sample input.",
    "Wordless IKEA pages are the source of truth for part geometry.",
  ],
};

export const LACK_GRAPH: AssemblyGraph = {
  title: "IKEA LACK side table — assembly",
  documentId: "AA-207276-4",
  tools: [],
  parts: [
    { id: "TOP", name: "Table top", qty: 1 },
    { id: "LEG", name: "Leg", qty: 4 },
  ],
  steps: [
    {
      index: 1,
      title: "Unpack and flip the table top",
      instruction:
        "Place the table top upside down on a soft surface so the four threaded inserts face up.",
      fasteners: [],
      tools: [],
      warnings: [],
    },
    {
      index: 2,
      title: "Thread the first two legs",
      instruction:
        "Screw two opposite legs into the inserts by hand until they seat. Do not cross-thread.",
      fasteners: ["LEG"],
      tools: [],
      warnings: [],
    },
    {
      index: 3,
      title: "Fit the remaining legs and stand the table",
      instruction:
        "Screw in the last two legs. Flip the table onto its legs and check it does not rock.",
      fasteners: ["LEG"],
      tools: [],
      warnings: [],
    },
  ],
  notes: ["From the IKEA 3D Assembly Dataset (Inter IKEA Systems B.V.)."],
};

export const BEKVAM_GRAPH: AssemblyGraph = {
  title: "IKEA BEKVÄM step stool — assembly",
  documentId: "AA-444158-9",
  tools: ["Phillips screwdriver"],
  parts: [
    { id: "STEP", name: "Step / tread", qty: 2 },
    { id: "SIDE", name: "Side frame", qty: 2 },
    { id: "BRACE", name: "Cross brace", qty: 2 },
    { id: "SCREW", name: "Wood screw", qty: 8 },
  ],
  steps: [
    {
      index: 1,
      title: "Attach the lower step to one side frame",
      instruction:
        "Align the lower tread with the side-frame pockets and drive the screws until snug.",
      fasteners: ["SCREW"],
      tools: ["Phillips screwdriver"],
      warnings: [],
    },
    {
      index: 2,
      title: "Fit the upper step",
      instruction:
        "Seat the upper tread and fasten it to the same side frame.",
      fasteners: ["SCREW"],
      tools: ["Phillips screwdriver"],
      warnings: [],
    },
    {
      index: 3,
      title: "Close the stool with the second side",
      instruction:
        "Offer up the second side frame, start every screw, then tighten evenly.",
      fasteners: ["SCREW"],
      tools: ["Phillips screwdriver"],
      warnings: [],
    },
    {
      index: 4,
      title: "Add the braces and check stability",
      instruction:
        "Install the cross braces. Stand on a level floor and confirm there is no wobble before use.",
      fasteners: ["SCREW"],
      tools: ["Phillips screwdriver"],
      warnings: ["Do not stand on the stool until every screw is tight."],
    },
  ],
  notes: ["From the IKEA 3D Assembly Dataset (Inter IKEA Systems B.V.)."],
};

const extras: Record<string, Omit<SampleManual, keyof (typeof SAMPLE_CARDS)[number]>> = {
  "ap-1": {
    pdfPath: path.join(root, "content/sample-manual/AP-1-ASM-001.pdf"),
    figuresDir: path.join(root, "content/sample-manual/figures"),
    graph: SAMPLE_GRAPH,
    text: SAMPLE_MANUAL_TEXT,
  },
  kallax: {
    pdfPath: path.join(root, "content/sample-manuals/kallax.pdf"),
    pagesDir: path.join(root, "content/sample-manuals/kallax-pages"),
    graph: KALLAX_GRAPH,
    text: KALLAX_GRAPH.steps.map((s) => `Step ${s.index} — ${s.title}. ${s.instruction}`).join("\n"),
  },
  bekvam: {
    pdfPath: path.join(root, "content/sample-manuals/bekvam.pdf"),
    pagesDir: path.join(root, "content/sample-manuals/bekvam-pages"),
    graph: BEKVAM_GRAPH,
    text: BEKVAM_GRAPH.steps.map((s) => `Step ${s.index} — ${s.title}. ${s.instruction}`).join("\n"),
  },
  lack: {
    pdfPath: path.join(root, "content/sample-manuals/lack.pdf"),
    pagesDir: path.join(root, "content/sample-manuals/lack-pages"),
    graph: LACK_GRAPH,
    text: LACK_GRAPH.steps.map((s) => `Step ${s.index} — ${s.title}. ${s.instruction}`).join("\n"),
  },
};

export const SAMPLE_CATALOG: SampleManual[] = SAMPLE_CARDS.map((card) => {
  const extra = extras[card.id];
  if (!extra) throw new Error(`Missing sample extras for ${card.id}`);
  return { ...card, ...extra };
});

export function getSample(id?: string | null) {
  return SAMPLE_CATALOG.find((s) => s.id === id) ?? SAMPLE_CATALOG[0];
}

export function listSamples() {
  return SAMPLE_CATALOG.map(({ graph, text, pdfPath, pagesDir, figuresDir, ...publicFields }) => ({
    ...publicFields,
    precut: sampleFilmReady(publicFields.id),
  }));
}
