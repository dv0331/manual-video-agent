---
name: google-media-l2-image-prompting
description: Google L2 prompt engineering for Gemini image generation (Nano Banana / gemini-3.1-flash-image). Use when writing or rewriting image prompts, using a style-reference still, expanding keywords with a text model, or generating 16:9 assembly/lecture frames.
---

# L2 — Prompt engineering for image generation

Source: DeepLearning.AI / Google course notebook `Lesson2.ipynb` (updated July 2026) plus [Ultimate prompting guide for Nano Banana](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana).

Do not change application code from this skill alone. Capture L3+ first unless the user asks to implement L2 now.

## Models (July 2026 notebook)

| Role | ID | Notes |
| --- | --- | --- |
| Image | `gemini-3.1-flash-image` | Replaces retired `gemini-3.1-flash-image-preview`. Same model, new endpoint. |
| Text (prompt expander) | `gemini-3-flash-preview` | Expands keywords into one generation prompt. |
| Client | `google.genai` on Vertex | `location="global"`, course helper `authenticate()` |

Image call shape:

```python
client.models.generate_content(
    model=IMAGE_MODEL_ID,
    contents=prompt,  # or [Part.from_bytes(...), instruction]
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="16:9"),
    ),
)
```

Supported aspect ratios in the notebook comment: `1:1, 3:2, 2:3, 3:4, 4:3, 1:4, 4:1, 4:5, 5:4, 1:8, 8:1, 9:16, 16:9, 21:9`.

Image generation is slow by design. The notebook warns: simple generate ~1 minute; reference-guided generate **a few minutes**. Outputs vary run to run.

## Lesson pattern: simple → enhance → reference

### 1. Simple prompt (weak)

A one-line subject is not enough:

```text
A diagram illustrating visual proof of the Pythagorean theorem.
```

This produces a generic figure. It does not lock layout, type, or camera.

### 2. Prompt enhancement (required)

Build **mandatory keywords**, then ask the **text** model to expand them into one high-fidelity prompt. Every keyword must appear. Output **only** the prompt string.

Course keyword slots:

| Slot | Example from the lab |
| --- | --- |
| `subject` | a simple slide |
| `action` | explaining visual proof of the Pythagorean theorem |
| `location` | white background |
| `camera_control` | eye-level shot |
| `lighting` | white light |
| `style` | minimalist |

Expander instruction (from the notebook):

```text
Your task is to expand the following keywords into a single, high-fidelity,
descriptive prompt for image generation. Every single keyword MUST be
included. Include reference images if provided and use that image as a
reference style guide for generated images. Output ONLY the final prompt
string, without any introduction or explanation. Mandatory Keywords: ...
```

### 3. Style-reference image (required when a template exists)

Do not treat the template as a pixel-perfect overlay. Pass the PNG as the first content part, then instruct:

```text
Use this reference image as a general style guide to generate a lecture slide.
Include only the necessary sections from the template. Use the guide as a
general style formatting template instead of a strict outline. The slide
image should be the entire image. Slide concept: {enhanced_prompt}
```

The lab’s before/after is exactly this: a generic slide template (content idea → structure → communication) becomes a 16:9 Pythagorean visual-proof slide with diagram, formula, and bullets — same graphic language, new content.

For assembly video: the **manual figure / IKEA page** is the style-and-part reference. The enhanced prompt is the human-assembly still. Do not invent hardware that is not in the reference.

## Nano Banana prompting (Google guide)

Start with a **strong verb** (generate, transform, place, remove).

**Text-to-image formula**

`[Subject] + [Action] + [Location/context] + [Composition] + [Style]`

**With references**

`[Reference images] + [Relationship instruction] + [New scenario]`

Up to **14** reference object images per prompt.

Rules that matter for assembly stills:

1. **Be specific** — subject, lighting, composition, which parts are in frame.
2. **Positive framing** — describe the desired state (“only the listed parts on the bench”) rather than a long list of absences. The course still needs a hard BOM constraint; phrase it as the allowed set, not “no extra screws.”
3. **Control the camera** — eye-level, 16:9, documentary / how-to still, shallow depth of field if useful.
4. **Iterate** — evaluate, then rewrite the prompt (the app’s retry loop). Prefer a better prompt over more random samples.
5. **Quoted on-image text** — if text must appear, put the exact words in quotes and name the type style. Assembly videos should keep step text as burned-in overlays, not invented labels in the still, unless the manual already shows them.
6. **Edit vs generate** — when a start frame exists, say what changes and what stays identical (hands move, hardware unchanged).

Director-level controls when needed: lighting setup, lens / angle, color grade, material of the parts (birch, cam lock, M10 bolt).

**Pipeline Google documents for motion later:** Nano Banana keyframe → Veo between frames → optional Lyria audio. L2 only covers the keyframe.

## Auth (course helper)

`authenticate()` loads `GOOGLE_APPLICATION_CREDENTIALS` or `credentials.json`, impersonates the same service account for a 2-hour token, and sets `GOOGLE_GENAI_USE_VERTEXAI=True`. Notebooks may override `GOOGLE_VERTEX_BASE_URL`.

## Resources

- [Gemini 3.1 Flash Image docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-flash-image)
- [Nano Banana prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
- [Vertex AI get started](https://docs.cloud.google.com/vertex-ai/docs/start/cloud-environment)
- Local copies: `references/` in this skill folder
