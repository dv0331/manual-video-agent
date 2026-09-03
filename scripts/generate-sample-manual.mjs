import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

const outDir = path.join(process.cwd(), "content", "sample-manual");
const publicDir = path.join(process.cwd(), "public", "sample-manual");

const ink = "#1d2118";
const paper = "#efe6d4";
const grid = "#d6cbb3";
const amber = "#c45c26";
const steel = "#4a5340";

function balloon(x, y, id) {
  return `
    <g>
      <circle cx="${x}" cy="${y}" r="16" fill="#efe6d4" stroke="${ink}" stroke-width="2"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="11" font-weight="700" fill="${ink}">${id}</text>
    </g>`;
}

function frame(title, figure) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1600" height="900" fill="${paper}"/>
  <rect width="1600" height="900" fill="url(#grid)"/>
  <rect x="36" y="36" width="1528" height="828" fill="none" stroke="${ink}" stroke-width="3"/>
  <rect x="36" y="36" width="1528" height="64" fill="#1d2118"/>
  <text x="60" y="78" font-family="DejaVu Sans, sans-serif" font-size="26" fill="#F2C14E" font-weight="700">AP-1-ASM-001  ·  ${title}</text>
  <text x="1480" y="78" text-anchor="end" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#efe6d4">REV A</text>
  ${figure}
  <text x="60" y="840" font-family="DejaVu Sans, sans-serif" font-size="16" fill="${steel}">Source-faithful illustration. Do not substitute hardware.</text>
</svg>`;
}

const figures = {
  "fig-01": frame(
    "Figure 1 — Seat column P-02 in base P-01",
    `
    <rect x="420" y="620" width="520" height="140" rx="8" fill="#b7b09c" stroke="${ink}" stroke-width="3"/>
    <polygon points="420,620 480,560 890,560 940,620" fill="#9a947e" stroke="${ink}" stroke-width="3"/>
    <rect x="610" y="250" width="140" height="320" fill="#8d9278" stroke="${ink}" stroke-width="3"/>
    <rect x="630" y="250" width="100" height="40" fill="#6f745c" stroke="${ink}" stroke-width="2"/>
    <circle cx="680" cy="680" r="18" fill="#cfc6b0" stroke="${ink}" stroke-width="2"/>
    <line x1="680" y1="570" x2="680" y2="250" stroke="${amber}" stroke-width="3" stroke-dasharray="10 8"/>
    <polygon points="680,250 670,275 690,275" fill="${amber}"/>
    ${balloon(980, 640, "P-01")}
    ${balloon(820, 320, "P-02")}
    <text x="980" y="680" font-family="DejaVu Sans, sans-serif" font-size="18" fill="${ink}">Base socket + dowel</text>
    `,
  ),
  "fig-02": frame(
    "Figure 2 — F-10 bolts and W-10 washers, finger-tight",
    `
    <rect x="430" y="600" width="500" height="130" rx="8" fill="#b7b09c" stroke="${ink}" stroke-width="3"/>
    <rect x="620" y="280" width="130" height="330" fill="#8d9278" stroke="${ink}" stroke-width="3"/>
    <g transform="translate(520,690)">
      <circle cx="0" cy="0" r="16" fill="#cfc6b0" stroke="${ink}" stroke-width="2"/>
      <rect x="-8" y="-28" width="16" height="22" fill="#6b6f58" stroke="${ink}" stroke-width="2"/>
    </g>
    <g transform="translate(840,690)">
      <circle cx="0" cy="0" r="16" fill="#cfc6b0" stroke="${ink}" stroke-width="2"/>
      <rect x="-8" y="-28" width="16" height="22" fill="#6b6f58" stroke="${ink}" stroke-width="2"/>
    </g>
    ${balloon(500, 740, "F-10")}
    ${balloon(900, 740, "W-10")}
    <rect x="1040" y="260" width="420" height="160" fill="#efe6d4" stroke="${amber}" stroke-width="3"/>
    <text x="1060" y="310" font-family="DejaVu Sans, sans-serif" font-size="22" fill="${amber}" font-weight="700">WARNING</text>
    <text x="1060" y="350" font-family="DejaVu Sans, sans-serif" font-size="18" fill="${ink}">Do not apply final torque</text>
    <text x="1060" y="380" font-family="DejaVu Sans, sans-serif" font-size="18" fill="${ink}">until step 5 travel check.</text>
    `,
  ),
  "fig-03": frame(
    "Figure 3 — Slide ram P-03 into column bore",
    `
    <rect x="700" y="240" width="150" height="460" fill="#8d9278" stroke="${ink}" stroke-width="3"/>
    <rect x="730" y="200" width="90" height="420" fill="#c9c2ab" stroke="${ink}" stroke-width="3"/>
    <path d="M730 240 l90 0 l0 280 l-18 0 l-10 16 l-16 0 l-10 -16 l-18 0 z" fill="#6f745c"/>
    <line x1="775" y1="180" x2="775" y2="240" stroke="${amber}" stroke-width="3" stroke-dasharray="8 6"/>
    ${balloon(920, 300, "P-03")}
    ${balloon(640, 420, "P-02")}
    <text x="980" y="360" font-family="DejaVu Sans, sans-serif" font-size="20" fill="${ink}">Oil rack teeth lightly</text>
    <text x="980" y="396" font-family="DejaVu Sans, sans-serif" font-size="20" fill="${ink}">Rack must show in pinion window</text>
    `,
  ),
  "fig-04": frame(
    "Figure 4 — Pinion P-05 and handle P-04",
    `
    <rect x="680" y="250" width="160" height="420" fill="#8d9278" stroke="${ink}" stroke-width="3"/>
    <rect x="710" y="270" width="100" height="300" fill="#c9c2ab" stroke="${ink}" stroke-width="2"/>
    <circle cx="760" cy="470" r="46" fill="#6b6f58" stroke="${ink}" stroke-width="3"/>
    <circle cx="760" cy="470" r="16" fill="#efe6d4" stroke="${ink}" stroke-width="2"/>
    <rect x="430" y="446" width="250" height="48" rx="8" fill="#4a5340" stroke="${ink}" stroke-width="3"/>
    <circle cx="430" cy="470" r="28" fill="#1d2118" stroke="${ink}" stroke-width="3"/>
    ${balloon(400, 400, "P-04")}
    ${balloon(860, 470, "P-05")}
    <text x="1000" y="400" font-family="DejaVu Sans, sans-serif" font-size="20" fill="${ink}">Mesh pinion with ram rack</text>
    <text x="1000" y="436" font-family="DejaVu Sans, sans-serif" font-size="20" fill="${ink}">Retain handle on pinion square</text>
    `,
  ),
  "fig-05": frame(
    "Figure 5 — Cycle ram, then torque F-10 to 18 N·m",
    `
    <rect x="640" y="230" width="150" height="430" fill="#8d9278" stroke="${ink}" stroke-width="3"/>
    <rect x="668" y="210" width="94" height="360" fill="#c9c2ab" stroke="${ink}" stroke-width="3"/>
    <path d="M715 210 L715 160" stroke="${amber}" stroke-width="4"/>
    <path d="M715 160 L700 180 L730 180 Z" fill="${amber}"/>
    <path d="M715 570 L715 640" stroke="${amber}" stroke-width="4"/>
    <path d="M715 640 L700 620 L730 620 Z" fill="${amber}"/>
    <rect x="430" y="620" width="560" height="90" fill="#b7b09c" stroke="${ink}" stroke-width="3"/>
    ${balloon(1080, 250, "P-03")}
    ${balloon(500, 650, "F-10")}
    <rect x="1040" y="300" width="440" height="180" fill="#efe6d4" stroke="${amber}" stroke-width="3"/>
    <text x="1060" y="350" font-family="DejaVu Sans, sans-serif" font-size="22" fill="${amber}" font-weight="700">WARNING</text>
    <text x="1060" y="390" font-family="DejaVu Sans, sans-serif" font-size="18" fill="${ink}">Keep fingers clear of the</text>
    <text x="1060" y="420" font-family="DejaVu Sans, sans-serif" font-size="18" fill="${ink}">ram path while cycling.</text>
    <text x="1060" y="454" font-family="DejaVu Sans, sans-serif" font-size="18" fill="${ink}">Then torque F-10 to 18 N·m.</text>
    `,
  ),
  "fig-06": frame(
    "Figure 6 — Rack guard P-06 with four F-08 screws, 8 N·m",
    `
    <rect x="660" y="240" width="170" height="420" fill="#8d9278" stroke="${ink}" stroke-width="3"/>
    <rect x="690" y="390" width="110" height="130" fill="#c9c2ab" stroke="${ink}" stroke-width="2"/>
    <rect x="676" y="376" width="138" height="158" fill="#6b6f58" fill-opacity="0.85" stroke="${ink}" stroke-width="3"/>
    <circle cx="694" cy="394" r="8" fill="#efe6d4" stroke="${ink}" stroke-width="2"/>
    <circle cx="796" cy="394" r="8" fill="#efe6d4" stroke="${ink}" stroke-width="2"/>
    <circle cx="694" cy="516" r="8" fill="#efe6d4" stroke="${ink}" stroke-width="2"/>
    <circle cx="796" cy="516" r="8" fill="#efe6d4" stroke="${ink}" stroke-width="2"/>
    ${balloon(900, 360, "P-06")}
    ${balloon(900, 520, "F-08")}
    <text x="1040" y="400" font-family="DejaVu Sans, sans-serif" font-size="20" fill="${ink}">Four M8 × 25 socket caps</text>
    <text x="1040" y="436" font-family="DejaVu Sans, sans-serif" font-size="20" fill="${ink}">Torque F-08 to 8 N·m</text>
    `,
  ),
};

async function svgToPng(svg, dest) {
  await sharp(Buffer.from(svg)).png().toFile(dest);
}

async function buildPdf(figurePaths) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageW = 612;
  const pageH = 792;
  const margin = 48;
  const inkColor = rgb(0.11, 0.13, 0.09);
  const rust = rgb(0.77, 0.36, 0.15);

  const cover = pdf.addPage([pageW, pageH]);
  cover.drawRectangle({ x: 0, y: pageH - 110, width: pageW, height: 110, color: rgb(0.11, 0.13, 0.09) });
  cover.drawText("AP-1-ASM-001  ·  REV A", {
    x: margin,
    y: pageH - 48,
    size: 12,
    font,
    color: rgb(0.95, 0.76, 0.31),
  });
  cover.drawText("Benchtop Arbor Press", {
    x: margin,
    y: pageH - 170,
    size: 28,
    font: bold,
    color: inkColor,
  });
  cover.drawText("Model AP-1  ·  Mechanical assembly procedure", {
    x: margin,
    y: pageH - 204,
    size: 14,
    font,
    color: inkColor,
  });
  const coverBody = [
    "This kit manual is the source of truth for the AP-1 press.",
    "Do not invent fasteners, tools, or torque values.",
    "",
    "Tools: 4 mm hex key, 10 mm wrench, rubber mallet,",
    "torque wrench 5–25 N·m.",
    "",
    "Parts: P-01 base, P-02 column, P-03 ram, P-04 handle,",
    "P-05 pinion shaft, P-06 rack guard, F-08 (×4),",
    "F-10 (×2), W-10 (×2).",
  ];
  coverBody.forEach((line, i) => {
    cover.drawText(line, { x: margin, y: pageH - 270 - i * 20, size: 12, font, color: inkColor });
  });

  const stepPages = [
    {
      title: "Step 1 — Seat the column in the base",
      body: "Stand base P-01 on a bench. Lower column P-02 into the base socket until the dowel engages. A rubber mallet may be used on a wood block. Do not force the fit.",
      fig: figurePaths[0],
    },
    {
      title: "Step 2 — Install base-to-column hardware",
      body: "Pass two F-10 M10 × 30 hex bolts with W-10 lock washers up through the base into the column. Seat them finger-tight only.",
      warn: "Do not apply final torque until ram travel is verified in step 5.",
      fig: figurePaths[1],
    },
    {
      title: "Step 3 — Slide the ram into the column",
      body: "Wipe ram rack P-03. Apply a thin film of machine oil to the rack teeth. Slide the ram into the column bore from the top until the rack is visible in the pinion window.",
      fig: figurePaths[2],
    },
    {
      title: "Step 4 — Mesh the pinion and fit the handle",
      body: "Insert pinion shaft P-05 through the column boss so the pinion teeth mesh with the ram rack. Fit handle P-04 onto the pinion square and retain it.",
      fig: figurePaths[3],
    },
    {
      title: "Step 5 — Verify travel, then torque the base",
      body: "Cycle the ram through full travel. Confirm there is no bind. Then torque both F-10 bolts to 18 N·m.",
      warn: "Keep fingers clear of the ram path while cycling.",
      fig: figurePaths[4],
    },
    {
      title: "Step 6 — Fit the rack guard",
      body: "Place rack guard P-06 over the pinion window. Install four F-08 M8 × 25 socket cap screws and torque to 8 N·m.",
      fig: figurePaths[5],
    },
  ];

  for (const step of stepPages) {
    const page = pdf.addPage([pageW, pageH]);
    page.drawText(step.title, { x: margin, y: pageH - 56, size: 16, font: bold, color: inkColor });
    const words = step.body.split(" ");
    let line = "";
    let y = pageH - 88;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, 11) > pageW - margin * 2) {
        page.drawText(line, { x: margin, y, size: 11, font, color: inkColor });
        line = word;
        y -= 16;
      } else {
        line = next;
      }
    }
    if (line) {
      page.drawText(line, { x: margin, y, size: 11, font, color: inkColor });
      y -= 22;
    }
    if (step.warn) {
      page.drawText(`WARNING: ${step.warn}`, { x: margin, y, size: 11, font: bold, color: rust });
      y -= 18;
    }
    const bytes = await sharp(step.fig).png().toBuffer();
    const img = await pdf.embedPng(bytes);
    const maxW = pageW - margin * 2;
    const scale = maxW / img.width;
    const h = img.height * scale;
    page.drawImage(img, { x: margin, y: Math.max(48, y - h - 8), width: maxW, height: h });
  }

  return pdf.save();
}

async function main() {
  await mkdir(path.join(outDir, "figures"), { recursive: true });
  await mkdir(publicDir, { recursive: true });
  const figurePaths = [];
  for (const [name, svg] of Object.entries(figures)) {
    const dest = path.join(outDir, "figures", `${name}.png`);
    await svgToPng(svg, dest);
    figurePaths.push(dest);
    await writeFile(path.join(outDir, "figures", `${name}.svg`), svg);
  }
  const pdfBytes = await buildPdf(figurePaths);
  await writeFile(path.join(outDir, "AP-1-ASM-001.pdf"), pdfBytes);
  await writeFile(path.join(publicDir, "AP-1-ASM-001.pdf"), pdfBytes);
  for (const file of figurePaths) {
    const base = path.basename(file);
    await sharp(file).resize(800).png().toFile(path.join(publicDir, base));
  }
  console.log("Wrote sample manual to", outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
