---
name: google-media-l4-evaluation
description: Google L4 evaluation techniques for generated images — SigLIP similarity, Gemini LLM-as-judge, and Vertex Gecko rubrics. Use when scoring assembly frames, writing eval prompts, choosing retry vs accept, or comparing aligned vs misaligned stills.
---

# L4 — Evaluation techniques

Source: DeepLearning.AI / Google `Lesson4.ipynb` (both copies are the same lab). Helpers: `plot_radar_comparison`, `make_gecko_row`, `extract_image`.

Do not change the assembly-video app from this skill alone. Capture L5+ first unless the user asks to implement L4 now.

## Setup of the lab

**Reference prompt** (the contract):

```text
A photorealistic golden retriever puppy wearing a tiny red raincoat,
sitting on a wet cobblestone street in Paris with the Eiffel Tower
visible in the background, soft morning light
```

- **Aligned image:** generate with `gemini-3.1-flash-image` from that prompt (`response_modalities=["TEXT","IMAGE"]`).
- **Misaligned image:** load a known-wrong still (`misaligned_image.png`). The course example is a **black cat on a beach at sunset** — same eval prompt, none of the required elements.

Every metric is run on **both** images. That pair is the point: a score is useless unless it separates match from mismatch.

Judge model: `gemini-3-flash-preview`. Vertex eval client: `us-central1`.

## Part 1 — SigLIP (fast scalar)

`google/siglip-base-patch16-224` + `SiglipProcessor`.

```text
score = sigmoid(logits_per_image)   # one float in [0, 1]
```

Lab bands: **> 0.5 strong | 0.2–0.5 moderate | < 0.2 weak**.

Use a **short** text string for SigLIP (nouns and place), not the full cinematic prompt:

```text
golden retriever puppy wearing red raincoat on cobblestone street in Paris with Eiffel Tower
```

**Tells you:** overall image–text alignment in one number.  
**Misses:** cannot explain why. Use as a cheap gate, not the only judge.

## Part 2 — LLM-as-a-judge (Gemini)

Criteria (1–5 each, plus `overall_score` and `summary`):

| Criterion | Meaning |
| --- | --- |
| `prompt_adherence` | Did the image do what the prompt asked? |
| `visual_quality` | Technical / aesthetic quality |
| `coherence` | Scene holds together |
| `creativity` | Acceptable invention within the brief |

Return **JSON only**. Strip markdown fences if the model wraps them.

Pass the PNG as `Part.from_bytes` plus the eval template. Plot the four scores as a radar (aligned blue vs misaligned red) with the SigLIP number on the thumbnail.

**Tells you:** multi-dimensional scores and a short explanation.  
**Misses:** non-deterministic; does not pin *which prompt token* failed.

## Part 3 — Gecko rubrics (per-element pass/fail)

Vertex Gen AI Evaluation Service:

1. Build a 2-row DataFrame with `make_gecko_row(prompt, image)` (prompt + model response as inline PNG).
2. `evals.generate_rubrics(..., predefined_spec_name=RubricMetric.GECKO_TEXT2IMAGE)`.
3. `evals.evaluate(..., metrics=[GECKO_TEXT2IMAGE(rubric_group_name=...)])`.

Gecko **decomposes the prompt** into checkable elements (puppy, red raincoat, cobblestones, Paris / Eiffel Tower, lighting) and marks each pass/fail.

**Tells you:** exactly which prompt elements failed (cat vs retriever, beach vs Paris).  
**Misses:** less flexible on subjective taste.

There is a Gecko **text-to-video** notebook for later motion eval.

## Putting it together (course line)

```text
SigLIP for speed → Gemini/Gecko for depth → Humans for critical decisions
```

Run cheap alignment first. If it is weak, skip expensive judges or fail fast. Use Gemini for why. Use Gecko when you must know *which* part of the brief is missing. A person still decides safety-critical accepts.

## Mapping to assembly video (do not implement yet)

The app already has an `evaluateFrame` rubric (`similarity`, `promptAdherence`, `visualQuality`, `partIdentity`, `safetyCoverage`, invented parts, warnings). L4 says to **stack** metrics, not replace one with another:

| Course | App today | Later alignment |
| --- | --- | --- |
| Aligned vs misaligned pair | Only the current frame | Keep a known-bad or previous-step check |
| SigLIP scalar | `similarity` (often LLM-estimated) | Optional cheap embedding gate before retries |
| Gemini JSON criteria | Existing judge prompt | Align names to L4; always demand explanation |
| Gecko element pass/fail | `inventedParts` / `allowedPartIds` | Per-part checks (SIDE, CAM, wall anchor) like Gecko elements |
| Human for critical | Operator watches the video | Keep warnings / torque as human-visible captions |

Retries should rewrite the **prompt** (L2) when Gecko-style element checks fail, not only resample.

Eval also explains slowness: Gemini judge + optional Gecko are **minutes** in the lab. Do not run the full stack three times unless the cheap score fails.

## Resources

- [Gecko paper](https://arxiv.org/abs/2404.16820)
- [Vertex evaluation overview](https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview)
- [Gecko text-to-image notebook](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/evaluation/evaluate_images_with_predefined_gecko.ipynb)
- [Gecko text-to-video notebook](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/evaluation/evaluate_videos_with_predefined_gecko.ipynb)
- Local copies: `references/` in this skill folder
