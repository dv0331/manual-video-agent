# Assemble — manuals to an assembly film

The goal is a **chaptered movie** of a person assembling the real parts. The homepage plays that goal first, then the reel that gets you there.

Open an IKEA sample or drop your own PDF. The agent extracts the procedure and cuts a how-to of a person fitting those parts, with a spoken line on every step.

Sample inputs in the repo:

- **IKEA KALLAX** — official published assembly instructions
- **IKEA BEKVÄM** and **IKEA LACK** — from the IKEA 3D Assembly Dataset
- **AP-1 benchtop arbor press** — original mechanical kit written for this tool

Each sample has a pre-cut film under `content/sample-films/{id}/`. Opening a sample copies that cut into a job so the player starts immediately. Uploading your own PDF still runs the full agent.

IKEA remains the rights holder. See `content/sample-manuals/NOTICE.md`.

## The reel (course-aligned)

Practices from the Google / DeepLearning.AI media-agents lessons (L2–L6, L8):

1. **Ingest** — keep the PDF; rasterize pages as the part reference.
2. **Plan** — each scene is ~20 words for 8 seconds, a camera move (`slow_zoom_in` / `slow_zoom_out` / `slow_left_to_right` / `static`), and workshop sound. One shared workshop look.
3. **Start frame** — 16:9 still of an adult at the bench, guided by the manual figure (style reference, not a pixel overlay).
4. **Image-to-video + voice** — quoted narration and a locked voice profile. Audio fail retries the clip and reuses the still. Visual fail remakes the still.
5. **Judge** — cheap alignment gate, then a scored critique. One prompt rewrite. Warnings stay human-visible.
6. **Cut** — concat clips, captions, chapter markers.

All scenes still shoot — they run **in parallel** (stills, voices, judges, retries). The film no longer waits on Sora unless you set `SORA_WAIT=1`. Target wall-clock is about one minute for a new upload, not one minute per scene. Set `SAMPLE_FILM_REGEN=1` only if you want to reshoot a sample instead of using the saved cut.

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

## Phone / public demo

`http://127.0.0.1:43127` only works on the machine running the app. Phones need a public **https** URL.

1. Set `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` in `.env.local`.
2. `npm run build && npm run start` (listens on `0.0.0.0:43127`).
3. In another terminal: `npm run public`. That prints a `https://….trycloudflare.com` link.
4. Open that link on the phone. Sign in on `/login`.

The Cloudflare URL stays up while this process is running.

## Render

This app is a Docker web service (`render.yaml`). It needs ffmpeg, a disk for `data/jobs`, and a process that does not sleep mid-generate.

1. In **your** Cursor agent box, run `/add-plugin render`, pick a scope, then **Authenticate**.
2. Put the repo on GitHub or GitLab (Render cannot pull this cloud workspace alone).
3. In the Render dashboard: **New → Blueprint** and select the repo. Set `OPENAI_API_KEY` when asked.
4. Sign in on `https://assemble.onrender.com` (or the URL Render prints) with user `shop` and the generated `BASIC_AUTH_PASSWORD`.

Starter plan stays online. The free web plan sleeps and will cut a generate job.

```bash
docker build -t assemble .
docker run --env-file .env.local -p 43127:43127 -v assemble-jobs:/app/data/jobs assemble
```

## Limits

- One procedure, up to eight scenes
- PDF or PNG/JPG, 20 MB
- No accounts, no database — jobs live under `data/jobs/`
