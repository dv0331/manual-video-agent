# Assemble — manuals to an assembly film

The goal is a **chaptered movie** of a person assembling the real parts. The homepage plays that goal first, then the reel that gets you there.

Open an IKEA sample or drop your own PDF. The agent extracts the procedure and cuts a how-to of a person fitting those parts, with a spoken line on every step.

Sample inputs in the repo:

- **IKEA KALLAX** — official published assembly instructions
- **IKEA BEKVÄM** and **IKEA LACK** — from the IKEA 3D Assembly Dataset
- **AP-1 benchtop arbor press** — original mechanical kit written for this tool

IKEA remains the rights holder. See `content/sample-manuals/NOTICE.md`.

## The reel (course-aligned)

Practices from the Google / DeepLearning.AI media-agents lessons (L2–L6, L8):

1. **Ingest** — keep the PDF; rasterize pages as the part reference.
2. **Plan** — each scene is ~20 words for 8 seconds, a camera move (`slow_zoom_in` / `slow_zoom_out` / `slow_left_to_right` / `static`), and workshop sound. One shared workshop look.
3. **Start frame** — 16:9 still of an adult at the bench, guided by the manual figure (style reference, not a pixel overlay).
4. **Image-to-video + voice** — quoted narration and a locked voice profile. Audio fail retries the clip and reuses the still. Visual fail remakes the still.
5. **Judge** — cheap alignment gate, then a scored critique. One prompt rewrite. Warnings stay human-visible.
6. **Cut** — concat clips, captions, chapter markers.

A six-step job is minutes per scene. Progress around 63% is scene 4 of 6, not the credits.

## Run locally

```bash
npm install
npm run sample-manual
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127). Watch the opening reel, then **Make this film**.

### Optional models

Copy `.env.example` to `.env.local`. **Do not commit that file or `credentials.json`.**

If `OPENAI_API_KEY` is set, the agent uses the US OpenAI endpoint (`https://us.api.openai.com/v1` by default):

- text model to understand, plan, and judge
- image model for the start frame
- Sora to animate that still (`USE_SORA=0` skips motion)
- TTS for the spoken line (espeak-ng if TTS fails)

If only `GEMINI_API_KEY` is set, it falls back to Gemini / optional Veo (`USE_VEO=1`). Classroom DeepLearning.AI service-account files do not work here.

## Deploy

Do **not** expose this app on a public tunnel. It holds API keys and assembly jobs.

```bash
npm run build && npm run start
```

Preview stays on [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Limits

- One procedure, up to eight scenes
- PDF or PNG/JPG, 20 MB
- No accounts, no database — jobs live under `data/jobs/`
