# Manuals to Assembly Video

Upload an instruction manual. The agent extracts the first coherent procedure and builds a chaptered video of **a person assembling the product** — IKEA furniture, a mechanical kit, or a PDF you drop in.

Sample inputs shipped in the repo:

- **IKEA KALLAX** — official published assembly instructions
- **IKEA BEKVÄM** and **IKEA LACK** — from the IKEA 3D Assembly Dataset
- **AP-1 benchtop arbor press** — original mechanical kit written for this tool

IKEA remains the rights holder. See `content/sample-manuals/NOTICE.md`.

## What the agent does

1. **Ingest** — keep the PDF and rasterize pages (IKEA pages stay as the part reference).
2. **Understand** — assembly graph: BOM, tools, sequence, warnings, torque.
3. **Plan** — each scene is a human performing that step. On-screen text is step index, part IDs, and warnings.
4. **Generate** — photoreal start frame of a person at the bench (guided by the manual figure). Then Sora-2 motion when an OpenAI key is present; otherwise a Ken Burns move on that same human still.
5. **Narrate** — each step is spoken (OpenAI TTS, or local espeak-ng if that fails). Sora workshop sound is ducked under the voice.
6. **Evaluate and stitch** — reject invented hardware, burn callouts, write chapter markers and captions.

Without an API key the pipeline still produces an MP4 from the extracted figures.

## Run locally

```bash
npm install
npm run sample-manual
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127). Open a sample PDF, then **Generate video**, or drop your own manual.

### Optional models

Copy `.env.example` to `.env.local`. **Do not commit that file.**

If `OPENAI_API_KEY` is set, the agent uses the US OpenAI endpoint (`https://us.api.openai.com/v1` by default):

- `gpt-5.4` to understand, plan, and judge
- `gpt-image-1.5` for a photoreal person assembling each step
- `sora-2` to animate that still into a short clip (`USE_SORA=0` skips motion generation)
- `gpt-4o-mini-tts` (then `tts-1`) to speak each assembly step

If only `GEMINI_API_KEY` is set, it falls back to Gemini. Set `USE_VEO=1` to try Veo motion.

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
