---
name: google-media-l6-video-agent
description: Google L6 ADK video production agent — plan_scenes, generate_scene_image, Veo generate_scene_video with spoken narration, evaluate_scene with audio/visual failure types, ffmpeg concat. Use when wiring a scene loop, image-to-video+audio, or retry-from-image vs retry-from-video.
---

# L6 — Building a video agent

Source: DeepLearning.AI / Google `Lesson6.ipynb` (July 2026 Gemini image endpoint). Lab brief: a 3-scene **RAG explainer** (embed the query → retrieve documents → generate a grounded answer). Style stills in `references/` match the navy technical-diagram look (garbled labels are expected).

Do not change the assembly-video app from this skill alone. Capture L7+ first unless the user asks to implement L6 now.

L5 was an image agent. L6 is the same ADK pattern for **video**: plan → start frame → Veo with native audio → judge the MP4 → retry by failure type → ffmpeg concat.

## Models (July 2026 notebook)

| Role | ID |
| --- | --- |
| Planner + video judge | `gemini-3.1-pro-preview` |
| Start-frame image | `gemini-3.1-flash-image` |
| Video | `veo-3.1-fast-generate-001` |
| Agent runtime | `google.adk` `Agent` + `Runner` + `InMemorySessionService` (`app_name="video_agent"`) |

L5 used `gemini-3-flash-preview` and `InMemoryRunner`. L6 upgrades the orchestrator/judge to **Pro** and uses `Runner` with an explicit session service. Auth is the same Vertex `authenticate()` helper. The run cell says **~10 minutes for 3 scenes**.

Shared constants (every scene):

```text
VOICE_PROFILE: calm, clear, male, neutral American accent. Warm baritone,
~140 wpm. Senior engineer explaining to a colleague. No uptalk, no vocal fry.

STYLE_PREFIX: Technical diagram on a dark navy background. Minimal flat
design, sans-serif labels. 16:9 aspect ratio.
```

Camera motion is an enum: `slow_left_to_right` | `slow_zoom_in` | `slow_zoom_out` | `static`.

## Lesson pattern: four tools, plan first, then wire

`plan_scenes` is **not** an agent tool. The notebook runs it once, dumps JSON into `SYSTEM_PROMPT`, then the agent only gets image / video / evaluate.

```text
plan_scenes(brief, num_scenes=3)          # offline, baked into the prompt
  → for each scene, one at a time, no batching:
       generate_scene_image
       → generate_scene_video (Veo image-to-video, generate_audio=True)
       → evaluate_scene (watch the MP4)
       → audio fail: regen video only, reuse the still
       → visual fail: regen image and video
       → max 1 retry; do not start the next scene until this one passes
  → ffmpeg concat scene_1.mp4 … scene_3.mp4 → rag_explainer.mp4
```

Teaching trick: scene 1’s **first** Veo call uses a corrupted narration (`quantum blockchain… photon matrices`). Evaluate is always given the **real** script, so the clip fails `audio` and the agent retries with the real line. Listen for the bad take, then the fix.

## Tool 1 — `plan_scenes`

```text
Break this into N scenes for an explainer video.
Each element:
  visual_description  — clean diagram layout
  narration_script    — exactly ~20 words spoken in 8 seconds
  camera_motion       — one of the four motions
Return ONLY the JSON array, no markdown.
```

Attach `VOICE_PROFILE` to every scene. Run `clean()` on string fields (strip non-printables). Strip markdown fences before `json.loads`.

Lab brief:

```text
Explain how RAG works - embedding the query, retrieving relevant
documents, and generating a grounded answer.
```

## Tool 2 — `generate_scene_image`

L2 image call with a **global style prefix**, not a brand-guide PNG:

```python
contents = STYLE_PREFIX + clean(visual_description)
config = GenerateContentConfig(response_modalities=["IMAGE", "TEXT"])
```

`extract_image` → `scene_{n}_ref.png`. No `ImageConfig` aspect ratio in this cell; 16:9 is only in `STYLE_PREFIX`.

## Tool 3 — `generate_scene_video`

L3 image-to-video, with **quoted narration + voice profile** in the prompt:

```python
full_prompt = (
    f"{clean(prompt)}\n\n"
    f"Narration spoken in a {clean(voice_profile)}:\n"
    f'"{clean(narration)}"'
)

client.models.generate_videos(
    model=VIDEO_MODEL,
    image=Image(image_bytes=..., mime_type="image/png"),
    prompt=full_prompt,
    config=GenerateVideosConfig(
        aspect_ratio="16:9",
        number_of_videos=1,
        duration_seconds=8,
        generate_audio=True,
    ),
)
```

Poll every **20s** (L3 used 15s). Timeout **300s**. Write `scene_{n}.mp4`.

This cell does **not** set `person_generation` or `resolution`. The lab is diagrams, not people. Assembly stills still need L3’s `person_generation="allow_adult"` and 720p.

## Tool 4 — `evaluate_scene`

Judge the **video bytes** (`Part.from_bytes`, `video/mp4`), not only the still. Default threshold **3.0** (L5 stills used 4.6 / 4.8).

| Criterion | Meaning |
| --- | --- |
| `temporal_consistency` | Objects stay coherent across frames |
| `motion_coherence` | Camera matches the planned direction |
| `prompt_adherence` | Visuals match the scene description |
| `visual_quality` | Sharp, no artifacts |
| `narration_alignment` | Spoken audio matches the expected script (or `narration_sync` if no script) |
| `voice_profile` | Tone and pace match professional narration |
| `scene_continuity` | Visual style is consistent |

Also return `failure_type`: `visual` | `audio` | `none`.

Hard rules in the tool:

- Empty judge text → fail as `audio`.
- `narration_alignment` / `narration_sync` **< 3** → force fail as `audio`.
- Print `-> Agent will retry from image step` vs `video step`.

## Wiring — `SYSTEM_PROMPT` + `Runner`

```text
You are a video production agent.
Produce a high-quality video for every scene in the plan.

Tools: generate_scene_image, generate_scene_video, evaluate_scene.
Process ONE scene at a time. Do NOT batch.
Always evaluate after generating a video.
Do not move on until the current scene passes.

Scene 1 first video call: use the corrupted narration.
Scene 1 retry and all other scenes: real narration_script.
evaluate_scene always gets the REAL narration_script.

If evaluation fails:
  audio  → regenerate video only, reuse the same image
  visual → regenerate image and video
Maximum 1 retry per scene. Then list the video file paths.
```

Tools are wrapped with `make_display_tool` (first lesson that uses it) so each call logs elapsed seconds.

```python
agent = Agent(
    name="video_agent",
    model=DLAIGemini(model=MODEL),  # 600s Vertex client, same as L5
    tools=[
        generate_scene_image_tool,
        generate_scene_video_tool,
        evaluate_scene_tool,
    ],
    instruction=SYSTEM_PROMPT,
)

runner = Runner(
    agent=agent,
    app_name="video_agent",
    session_service=InMemorySessionService(),
)
# user message: "Start video production."
```

## Final stitch

```bash
ffmpeg -f concat -safe 0 -i scenes.txt -c copy rag_explainer.mp4
```

No re-encode. Concat order is `scene_1.mp4` … `scene_3.mp4`.

## Putting it together (course line)

```text
Plan scenes with locked voice + camera enum
  → one shared visual style prefix
  → start frame
  → Veo image-to-video with generate_audio and quoted speech
  → judge the MP4
  → retry video-only on audio fail, image+video on visual fail
  → concat
```

Serial on purpose. Native Veo audio, not a silent clip plus later TTS. Prompt rewrite / correct narration beats blind resample.

## Mapping to assembly video (do not implement yet)

This lesson is the closest to the current job runner.

| Course | App today | Later alignment |
| --- | --- | --- |
| `plan_scenes` (~20 words / 8s, camera enum) | `understand` / `plan` from the manual | Lock narration length to clip duration; add camera_motion |
| `STYLE_PREFIX` on every still | Per-scene prompts | One workshop look (bench, lighting, same adult assembler) |
| `generate_scene_image` | `generateFrame` | Keep L2 keyword expand + manual as style/BOM ref |
| Veo `image=` + `generate_audio=True` + quoted line | Ken Burns / Sora + separate TTS mux | Prefer Veo speech; keep captions as overlays |
| `evaluate_scene` on the MP4, `failure_type` | Judge the still only | Split retries: bad speech → video only; wrong parts → new still + video |
| One scene at a time, max 1 retry | Serial, up to 3 still retries | Keep serial; do not batch Veo |
| `ffmpeg -c copy` concat | Existing stitch + Safari remux | Concat after each scene passes |
| ~10 min / 3 scenes | ~26 min / 6-step KALLAX | 63% is mid-pipeline; budget minutes per Veo poll (20s, 300s cap) |
| `gemini-3.1-pro-preview` orchestrator | gpt-5.4 / Gemini flash | Heavier planner + video judge |
| Corrupted-narration demo | — | Do not ship; it is a teaching fail |

L3’s `person_generation="allow_adult"` is still required for a human assembling. L6 omitted it because the RAG lab is diagrams only.

Do not invent hardware that is not in the manual. The planner must not add core objects the brief did not ask for.

## Resources

- [Agent Development Kit](https://google.github.io/adk-docs/)
- [Veo documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/video/overview)
- [Veo 3.1 prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- Local copies: `references/` in this skill folder
