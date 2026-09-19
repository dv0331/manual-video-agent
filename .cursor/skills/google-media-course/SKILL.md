---
name: google-media-course
description: Index for the Google / DeepLearning.AI media-agents course skills. Use when building or refactoring the manuals-to-video agent from course lessons, Gemini image/video pipelines, evaluation, or when the user uploads a new lesson notebook.
---

# Google media-agents course

Do **not** rewrite the assembly-video app from a single lesson. Capture each lesson as its own skill first. Apply changes only after the user says the lesson set is ready, or after they explicitly ask to implement.

## Lesson status

| Lesson | Topic | Skill | Status |
| --- | --- | --- | --- |
| L1 | (not uploaded) | — | waiting |
| L2 | Prompt engineering for image generation | `google-media-l2-image-prompting` | captured |
| L3–L8 | (not uploaded) | — | waiting |

When a new notebook arrives: read it fully, write or update that lesson’s skill, then stop and wait unless the user asks to implement.

## Stack from course `requirements.txt`

- `google-genai` — Gemini generate_content for text and images
- `google-cloud-aiplatform[evaluation]` — Vertex evaluation (later lessons)
- `google-adk` — agent toolkit (later lessons)
- `transformers` / `torch` / `SentencePiece` — likely SigLIP / Gecko eval
- `Pillow`, `matplotlib`, `numpy`, `pandas`, `python-dotenv`

## Shared helper (`helper.py`)

Present in L2 materials but used across later labs:

- `authenticate()` — service-account file → impersonated 2-hour Vertex token, sets `GOOGLE_GENAI_USE_VERTEXAI=True`
- `extract_image(response)` — first inline image part → PIL
- `make_gecko_row(prompt, image)` — Gecko eval row with base64 PNG
- `plot_radar_comparison(...)` — Gemini vs SigLIP scores
- `make_display_tool(fn)` — wrap tools and log elapsed seconds
- `clean(s)` — strip non-printable characters

Do not invent L3+ behavior from these helpers. Wait for those notebooks.

## How this maps to the assembly app (do not implement until asked)

The current job is slow because each scene runs **serially**: image generate → judge → optional retry (up to 3) → TTS → Ken Burns → optional Sora poll. Progress `40 + (sceneIndex / n) * 45` means **~63% is scene 4 of 6**, not “almost done.” A 6-step KALLAX job has taken ~26 minutes.

L2 practices that will matter later: structured image prompts, a text model that expands keywords, a style-reference image, 16:9 `image_config`, and “wait, this cell takes minutes” as the expected cost of image models.
