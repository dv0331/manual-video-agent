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

### Optional models

Copy `.env.example` to `.env.local`. **Do not commit that file.**

If `OPENAI_API_KEY` is set, the agent uses the US OpenAI endpoint (`https://us.api.openai.com/v1` by default):

- `gpt-5.4` to understand, plan, and judge
- `gpt-image-1.5` only when a step has no figure

If only `GEMINI_API_KEY` is set, it falls back to Gemini. Without either key it still produces a Ken Burns video from the extracted figures.

## Deploy

Do **not** expose this app on a public tunnel. It holds API keys and assembly jobs. Run it on this machine or a private container host:

```bash
npm run build && npm run start
```

Preview stays on [http://127.0.0.1:43127](http://127.0.0.1:43127). For a private container:

```bash
docker build -t manuals-to-video .
docker run --rm -p 127.0.0.1:43127:43127 --env-file .env.local manuals-to-video
```

## Limits

- One procedure, up to eight scenes
- PDF or PNG/JPG, 20 MB
- No accounts, no database — jobs live under `data/jobs/`

