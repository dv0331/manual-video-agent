import type { AssemblyGraph } from "@/lib/agent/types";

export const SAMPLE_DOCUMENT_ID = "AP-1-ASM-001";

export const SAMPLE_GRAPH: AssemblyGraph = {
  title: "Benchtop Arbor Press AP-1 — Mechanical Assembly",
  documentId: SAMPLE_DOCUMENT_ID,
  tools: [
    "4 mm hex key",
    "10 mm combination wrench",
    "Rubber mallet",
    "Torque wrench 5–25 N·m",
  ],
  parts: [
    { id: "P-01", name: "Base casting", qty: 1 },
    { id: "P-02", name: "Column", qty: 1 },
    { id: "P-03", name: "Ram", qty: 1 },
    { id: "P-04", name: "Handle assembly", qty: 1 },
    { id: "P-05", name: "Pinion shaft", qty: 1 },
    { id: "P-06", name: "Rack guard", qty: 1 },
    { id: "F-08", name: "M8 × 25 socket cap screw", qty: 4 },
    { id: "F-10", name: "M10 × 30 hex bolt", qty: 2 },
    { id: "W-10", name: "M10 lock washer", qty: 2 },
  ],
  steps: [
    {
      index: 1,
      title: "Seat the column in the base",
      instruction:
        "Stand the base casting P-01 on a bench. Lower column P-02 into the base socket until the dowel engages. Do not force the fit.",
      figureRef: "Figure 1",
      fasteners: [],
      tools: ["Rubber mallet"],
      warnings: [],
    },
    {
      index: 2,
      title: "Install base-to-column hardware",
      instruction:
        "Pass two F-10 M10 × 30 hex bolts with W-10 lock washers up through the base into the column. Seat them finger-tight only.",
      figureRef: "Figure 2",
      fasteners: ["F-10", "W-10"],
      tools: ["10 mm combination wrench"],
      warnings: [
        "Do not apply final torque until ram travel is verified in step 5.",
      ],
      torque: "Hand tight",
      dependsOn: [1],
    },
    {
      index: 3,
      title: "Slide the ram into the column",
      instruction:
        "Wipe the ram rack P-03. Apply a thin film of machine oil to the rack teeth. Slide the ram into the column bore from the top until the rack is visible in the pinion window.",
      figureRef: "Figure 3",
      fasteners: [],
      tools: [],
      warnings: [],
      dependsOn: [2],
    },
    {
      index: 4,
      title: "Mesh the pinion and fit the handle",
      instruction:
        "Insert pinion shaft P-05 through the column boss so the pinion teeth mesh with the ram rack. Fit handle assembly P-04 onto the pinion square and retain it.",
      figureRef: "Figure 4",
      fasteners: [],
      tools: ["4 mm hex key"],
      warnings: [],
      dependsOn: [3],
    },
    {
      index: 5,
      title: "Verify travel, then torque the base",
      instruction:
        "Cycle the ram through full travel. Confirm there is no bind. Then torque both F-10 bolts to 18 N·m.",
      figureRef: "Figure 5",
      fasteners: ["F-10"],
      tools: ["Torque wrench 5–25 N·m"],
      warnings: ["Keep fingers clear of the ram path while cycling."],
      torque: "18 N·m",
      dependsOn: [4],
    },
    {
      index: 6,
      title: "Fit the rack guard",
      instruction:
        "Place rack guard P-06 over the pinion window. Install four F-08 M8 × 25 socket cap screws and torque to 8 N·m.",
      figureRef: "Figure 6",
      fasteners: ["F-08"],
      tools: ["4 mm hex key", "Torque wrench 5–25 N·m"],
      warnings: [],
      torque: "8 N·m",
      dependsOn: [5],
    },
  ],
  notes: [
    "The manual is the source of truth. Do not substitute fasteners or torque values.",
    "Work on a level bench. Deburr mating faces before assembly.",
  ],
};

export const SAMPLE_MANUAL_TEXT = `
BENCHTOP ARBOR PRESS
Model AP-1
Document ${SAMPLE_DOCUMENT_ID}  ·  Revision A  ·  Mechanical assembly procedure

1. Purpose
This procedure assembles the AP-1 benchtop arbor press from the supplied kit. Follow the sequence. Do not invent fasteners, tools, or torque values.

2. Tools required
- 4 mm hex key
- 10 mm combination wrench
- Rubber mallet
- Torque wrench 5–25 N·m

3. Parts list
- P-01 Base casting (1)
- P-02 Column (1)
- P-03 Ram (1)
- P-04 Handle assembly (1)
- P-05 Pinion shaft (1)
- P-06 Rack guard (1)
- F-08 M8 × 25 socket cap screw (4)
- F-10 M10 × 30 hex bolt (2)
- W-10 M10 lock washer (2)

4. Assembly steps

Step 1 — Seat the column in the base
Stand the base casting P-01 on a bench. Lower column P-02 into the base socket until the dowel engages. A rubber mallet may be used on a wood block. Do not force the fit.
See Figure 1.

Step 2 — Install base-to-column hardware
Pass two F-10 M10 × 30 hex bolts with W-10 lock washers up through the base into the column. Seat them finger-tight only.
WARNING: Do not apply final torque until ram travel is verified in step 5.
See Figure 2.

Step 3 — Slide the ram into the column
Wipe the ram rack P-03. Apply a thin film of machine oil to the rack teeth. Slide the ram into the column bore from the top until the rack is visible in the pinion window.
See Figure 3.

Step 4 — Mesh the pinion and fit the handle
Insert pinion shaft P-05 through the column boss so the pinion teeth mesh with the ram rack. Fit handle assembly P-04 onto the pinion square and retain it with the 4 mm hex key.
See Figure 4.

Step 5 — Verify travel, then torque the base
Cycle the ram through full travel. Confirm there is no bind. Then torque both F-10 bolts to 18 N·m.
WARNING: Keep fingers clear of the ram path while cycling.
See Figure 5.

Step 6 — Fit the rack guard
Place rack guard P-06 over the pinion window. Install four F-08 M8 × 25 socket cap screws and torque to 8 N·m.
See Figure 6.
`.trim();
