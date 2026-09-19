---
name: google-media-course
description: Index for the Google / DeepLearning.AI media-agents course skills. Use when building or refactoring the manuals-to-video agent from course lessons, Gemini image/video pipelines, evaluation, or when the user uploads a new lesson notebook.
---

# Google media-agents course

Lesson skills are captured (L2–L6, L8). The assembly app now follows that reel: plan → style-referenced still → image-to-video with quoted speech → stacked judge → one rewrite → concat. Classroom `credentials.json` is still not used.

## Lesson status

| Lesson | Topic | Skill | Status |
| --- | --- | --- | --- |
| L1 | (notebook not uploaded) | shared `helper.py` / `requirements.txt` only | waiting for notebook |
| L2 | Prompt engineering for image generation | `google-media-l2-image-prompting` | captured |
| L3 | Prompt engineering for video generation | `google-media-l3-video-prompting` | captured |
| L4 | Evaluation techniques | `google-media-l4-evaluation` | captured |
| L5 | Image generation agent (ADK tools) | `google-media-l5-image-agent` | captured |
| L6 | Video production agent (ADK + Veo) | `google-media-l6-video-agent` | captured |
| L7 | Gemini CLI authoring (no notebook) | `nano-banana-image-gen`, `adk-agent-creator` | captured (skills only) |
| L8 | Infographic agent (Gemini CLI result) | `google-media-l8-infographic-agent` | captured |

Uploaded set is **L2–L6 + L8**. L1’s notebook is still missing; the shared lab `helper.py` and `requirements.txt` are identical to the copies already in L2–L8. L7 has no notebook — it is the CLI session that produced L8.

A DeepLearning.AI `credentials.json` was also sent. **Do not commit it.** It is a classroom service-account file for project `dlai-gen-media` whose `token_uri` is the internal Jupyter proxy `jupyter-api-proxy.internal.dlai`. That path will not work in this environment. The assembly app already uses the OpenAI US endpoint plus optional `GEMINI_API_KEY`. Do not copy the key into the repo or into `.env*`.

When a new notebook arrives: read it fully, write or update that lesson’s skill, then stop and wait unless the user asks to implement.

## Stack from course `requirements.txt`

- `google-genai` — Gemini generate_content for text and images
- `google-cloud-aiplatform[evaluation]` — Vertex evaluation (later lessons)
- `google-adk` — agent toolkit (L5/L8 `InMemoryRunner` + `LlmAgent`; L6 `Runner` + `InMemorySessionService`)
- `transformers` / `torch` / `SentencePiece` — SigLIP / Gecko eval (L4)
- `Pillow`, `matplotlib`, `numpy`, `pandas`, `python-dotenv`

## Shared helper (`helper.py`)

Canonical copies: `references/helper.py` and `references/requirements.txt` in this skill folder. Same files shipped with L2–L8. `authenticate()` looks for `GOOGLE_APPLICATION_CREDENTIALS`, then `./credentials.json`, then `../credentials.json`.

- `authenticate()` — service-account file → impersonated 2-hour Vertex token, sets `GOOGLE_GENAI_USE_VERTEXAI=True`
- `extract_image(response)` — first inline image part → PIL
- `make_gecko_row(prompt, image)` — Gecko eval row with base64 PNG
- `plot_radar_comparison(...)` — Gemini vs SigLIP scores
- `make_display_tool(fn)` — wrap tools and log elapsed seconds
- `clean(s)` — strip non-printable characters

L8 does not add helper functions. `make_display_tool` is used in L6; L8 logs with `log_step` into `infographic_agent.log` instead.

## How this maps to the assembly app (do not implement until asked)

The current job is slow because each scene runs **serially**: image generate → judge → optional retry (up to 3) → TTS → Ken Burns → optional Sora poll. Progress `40 + (sceneIndex / n) * 45` means **~63% is scene 4 of 6**, not “almost done.” A 6-step KALLAX job has taken ~26 minutes.

L2: structured image prompts, keyword expansion, style-reference still, 16:9 image config.

L3: Veo is a **minutes-long** poll (`sleep(15)` until `operation.done`). Course path is **image-to-video with audio**, not a text-only clip. Start frame from L2, then `generate_videos` with `generate_audio=True`, `person_generation="allow_adult"`, 8s / 16:9 / 720p. Video prompt slots include **camera movement, sound effects, and dialogue**. A one-line motion prompt is the “simple” anti-pattern.

L4: Always compare an **aligned** generation to a **known-bad** image against the same reference prompt. Stack **SigLIP** (fast scalar) → **Gemini judge** (scored criteria + explanation) → **Gecko rubrics** (which prompt elements passed). Final line of the lab: *SigLIP for speed → Gemini/Gecko for depth → Humans for critical decisions.*

L5: First ADK agent. Tools are `brand_analysis` → `generate_design_concepts` (two distinct ideas) → `generate_idea_image` (16:9, guide as style ref) → `evaluate_image` (CRAP + brand, pass at 4.6 in tests / 4.8 in the agent, max 1 prompt-rewrite retry). `InMemoryRunner(app_name="image_agent")`. Lab brand is TuringTaste / `guide.png`. The planner model only orchestrates; the image model draws.

L6: Video agent for a 3-scene RAG explainer. `plan_scenes` runs **offline** (visual, ~20-word / 8s narration, camera enum) and is baked into the system prompt. Agent tools: start frame → Veo image-to-video with `generate_audio=True` and quoted speech + voice profile → `evaluate_scene` on the **MP4** (threshold 3.0, `failure_type` audio vs visual). Audio fail retries video only; visual fail retries image+video. One scene at a time, max 1 retry, then `ffmpeg -c copy`. Orchestrator is `gemini-3.1-pro-preview`. Lab says **~10 min for 3 scenes**.

L7: No notebook. Gemini CLI plus course skills `nano-banana-image-gen` and `adk-agent-creator` (`adk create` / `adk run` / `adk web`, Vertex `global`, Flash Image + Flash text).

L8: Runs the CLI-built **infographic** agent. One coarse tool `infographic_workflow(url)`: fetch first 5000 chars → Nano Banana still → Gemini judge (factual / spelling / aesthetics) → `PASS` or append feedback, max 3 attempts, timestamped log. Lab source is the [Lyria 3 Pro prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-lyria-3-pro). First still failed (duplicate sections, treated Lyria as a text LLM); second passed as a music-prompting diagram. Lyria itself is a **music** model (optional later score). L8 does not call it.
