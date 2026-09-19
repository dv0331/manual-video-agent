---
name: google-media-l3-video-prompting
description: Google L3 prompt engineering for Veo video generation. Use when writing motion prompts, image-to-video clips, Veo audio/dialogue, polling generate_videos, or connecting an L2 still to an 8s 16:9 shot.
---

# L3 — Prompt engineering for video generation

Source: DeepLearning.AI / Google notebook `Lesson3.ipynb` plus [Ultimate prompting guide for Veo 3.1](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1).

Do not change the assembly-video app from this skill alone. Capture L4+ first unless the user asks to implement L3 now.

## Models (July 2026 notebook)

| Role | ID |
| --- | --- |
| Start-frame image | `gemini-3.1-flash-image` |
| Video-prompt expander | `gemini-3-flash-preview` |
| Video | `veo-3.1-fast-generate-001` |

Auth is the same Vertex `authenticate()` helper as L2.

## Lesson pattern: simple clip → start frame → enhanced image-to-video

### 1. Simple prompt (weak)

Text-only Veo with no start frame and no structure:

```text
A person explaining the Pythagorean theorem.
```

Config still sets 16:9, 8s, 720p, `person_generation="allow_adult"`, `generate_audio=True`. The shot is generic. The notebook warns this cell takes **a few minutes**.

### 2. Generate the input image first (L2)

Use the L2 slide still as a **reference**, then generate the first frame of the video:

```text
Generate a professor in a classroom full of students in
front of the provided slide image.
```

16:9 image config. Save as `video-image.png`. This is the same idea as the lecture-hall still: the slide content stays, a real person is placed in front of it.

### 3. Prompt enhancement for video (required)

Mandatory keyword slots in the lab (more than L2 — **sound and camera motion**):

| Slot | Lab example |
| --- | --- |
| `subject` | a professor |
| `action` | giving a lecture on the Pythagorean theorem |
| `scene` | in a classroom, presenting in front of students |
| `style` | photorealistic |
| `camera_angle` | eye-level shot |
| `camera_movement` | zoom in |
| `sound_effects` | clicking of computer keys |
| `dialogue` | quoted spoken line about squaring a side as an area |

Text-model expander:

```text
Your task is to expand the following keywords into a single, high-fidelity,
descriptive prompt for video generation. Every single keyword MUST be
included. Synthesize them into a single, cohesive, and cinematic
instruction. Do not add any new core concepts. Output ONLY the final
prompt string, without any introduction or explanation.
```

### 4. Image-to-video with audio

```python
operation = client.models.generate_videos(
    model=VIDEO_MODEL_ID,
    prompt=video_prompt,
    image=types.Image.from_file(location="video-image.png"),
    config=types.GenerateVideosConfig(
        aspect_ratio="16:9",
        number_of_videos=1,
        duration_seconds=8,
        resolution="720p",
        person_generation="allow_adult",
        generate_audio=True,
    ),
)

while not operation.done:
    time.sleep(15)
    operation = client.operations.get(operation)

video_bytes = operation.result.generated_videos[0].video.video_bytes
```

Poll every 15 seconds. Expect **a few minutes**. Save bytes to MP4.

`person_generation="allow_adult"` is required for a human assembling or lecturing.

## Veo 3.1 guide (Google)

Formula: `[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]`

- **Camera movement:** dolly, tracking, crane, aerial, slow pan, POV, zoom in (lab).
- **Composition:** wide, close-up, eye-level, two-shot.
- **Dialogue:** put exact speech in quotes.
- **SFX / ambient:** name the sounds (keys, workshop, tools).
- **Negative prompts:** describe the desired empty state, not a long “no X” list.
- **Prompt enhancement with Gemini:** same as the lab expander.

Advanced controls (not in the L3 notebook, but official):

- **First + last frame** — generate start and end stills, then one Veo transition (useful later for step N → step N+1).
- **Ingredients to video** — up to a few reference assets for character/product consistency.
- **Timestamp prompting** — `[00:00-00:02] ...` for multi-shot pacing inside one 8s clip.
- Clip lengths 4 / 6 / 8s; 720p or 1080p; 16:9 or 9:16.

L2 already said: Nano Banana keyframe → Veo → optional Lyria. L3 is the Veo step, with **native `generate_audio`** (dialogue + SFX), not a silent clip plus a later mux unless you still need burned-in captions.

## Mapping to assembly video (do not implement yet)

| Course | App today | Later alignment |
| --- | --- | --- |
| Weak one-line motion prompt | Short `motionPrompt` | Expand with L3 keyword slots |
| Start frame from L2 image | `generateFrame` then Ken Burns / Sora | Prefer Veo `image=` that start frame |
| `generate_audio=True` + dialogue in prompt | Separate OpenAI TTS mux | Veo can speak the step; keep captions |
| Poll 15s, minutes per clip | Sora poll up to ~150s per scene, serial | Budget minutes per scene; 63% ≠ almost done |
| `allow_adult` | Photoreal person assembling | Keep this flag on Veo |

Do not add new hardware in the video prompt. The expander must not invent core concepts.

## Resources

- [Veo 3.1 Fast docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate#3.1-fast-generate-001)
- [Veo 3.1 prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- Local copies: `references/` in this skill folder
