# Manuals to Assembly Video

A media agent for mechanical assembly. Upload an instruction manual (PDF or page images). The agent extracts the first coherent procedure, plans a multi-scene storyboard from the figures, evaluates each frame so it does not invent hardware, then stitches a chaptered video you can follow at the bench.

The sample kit is an original **Benchtop Arbor Press AP-1** manual — not a scraped vendor PDF.

## What the agent does

1. **Ingest** — keep source text and figures.
2. **Understand** — assembly graph: BOM, tools, sequence, warnings, torque.
3. **Plan** — dual-channel storyboard (voice explains; on-screen text is step index, part IDs, and warnings).
4. **Generate and evaluate** — start from the manual figure; score similarity, LLM-judge quality, and a structured rubric (no invented parts, warnings present, sequence correct). Failed scenes are rewritten and retried.
5. **Stitch** — Ken Burns motion with burned-in callouts, plus a VTT chapter track. Optional Veo animation if you turn it on.

Without an API key the same pipeline still produces a real MP4 from the extracted figures.

## Run locally

```bash
npm install
npm run sample-manual
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127). Use **Generate sample video** or drop your own PDF.

### Optional Gemini

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`. The agent then uses:

- `gemini-3.6-flash` to understand, plan, and judge
- `gemini-3.1-flash-image` (Nano Banana) only when a step has no figure
- `veo-3.1-lite-generate-preview` if you also set `USE_VEO=1`

Veo is off by default because clip generation is slow and billed. Ken Burns from the source figures is the faithful default for shop-floor assembly.

## Limits

- One procedure, up to eight scenes
- PDF or PNG/JPG, 20 MB
- No accounts, no database — jobs live under `data/jobs/`
