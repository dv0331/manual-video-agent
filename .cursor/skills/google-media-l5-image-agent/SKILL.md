---
name: google-media-l5-image-agent
description: Google L5 ADK image generation agent — brand_analysis, generate_design_concepts, generate_idea_image, evaluate_image, InMemoryRunner. Use when wiring a style-guide-to-image loop, ADK tools, or a generate-then-judge retry for UI or assembly stills.
---

# L5 — Image generation agent

Source: DeepLearning.AI / Google `Lesson5.ipynb` (July 2026 Gemini image endpoint). Prefer the current notebook over `Lesson5.ipynb.bak`. Lab example brand: **TuringTaste** cooking app; style file `guide.png`.

Do not change the assembly-video app from this skill alone. Capture L6+ first unless the user asks to implement L5 now.

This is the first lesson that actually uses `google-adk`. L2–L4 were single-model calls. L5 wraps those calls as **tools** and lets an ADK `Agent` decide the order.

## Models (July 2026 notebook)

| Role | ID |
| --- | --- |
| Text / judge / planner | `gemini-3-flash-preview` |
| Image (Nano Banana) | `gemini-3.1-flash-image` (replaces retired `gemini-3.1-flash-image-preview`) |
| Agent runtime | `google.adk` `Agent` + `InMemoryRunner` (`app_name="image_agent"`) |

Auth is the same Vertex `authenticate()` helper as L2–L4. Image and judge cells are marked **a few minutes**. Outputs vary run to run.

The wired agent uses a course-specific `DLAIGemini` subclass so ADK talks to the same Vertex client (`location="global"`, `GOOGLE_VERTEX_BASE_URL`, **600s** timeout). The older `.bak` cached one client and used 180s plus a 3-attempt runner retry; the current notebook uses `httpx.AsyncClient` at 600s and no outer retry.

## Lesson pattern: four tools, then wire the agent

Pipeline the system prompt enforces:

```text
brand_analysis(guide.png)
  → generate_design_concepts (two distinct ideas)
    → for each idea:
         generate_idea_image (16:9, guide as style ref)
         → evaluate_image (threshold 4.8)
         → if fail: rewrite prompt from feedback, max 1 retry
    → list two passing image paths
```

Standalone tool tests use a **4.6** threshold. The wired agent raises that to **4.8**.

User brief in the lab:

```text
Create a UI landing page for this cooking app.
The initial style guide image is in a file named guide.png
```

## Tool 1 — `brand_analysis`

Input: path to the brand-guidelines PNG.

Extract **Visual Design DNA** as structured JSON (`response_mime_type="application/json"` + Pydantic `BrandInfo`):

| Field | What the prompt asks for |
| --- | --- |
| `colors` | Primary / secondary / accent HEX and vibe |
| `typography` | Families, weights, hierarchy |
| `icon_style` | Logo geometry + icon language (thin-line, clay, solid glyphs, …) |
| `brand_voice` | Five personality keywords |
| `ui_elements` | Radii, shadows, spacing |

Pass the PNG as `Part.from_bytes`, then the analysis instruction. This is L2’s style-reference idea, but **named and stored** so later tools can reuse it.

## Tool 2 — `generate_design_concepts`

Inputs: `user_description`, brand-guidelines image, extracted `brand_guidelines` JSON.

Returns `Ideas { ideas: [{ title, description, prompt }] }`.

The `prompt` field is a **Nano Banana prompt** — visual details only, for Tool 3. The concept must meet the user brief and stay on-brand. The system prompt requires **two distinct** concepts (theme, components, layout, elements). If they are too similar, generate again until they differ.

## Tool 3 — `generate_idea_image`

Inputs: concept `prompt` + brand-guidelines image.

Same L2 image call, with the guide as the first content part:

```python
client.models.generate_content(
    model=IMAGE_MODEL_ID,
    contents=[
        types.Part.from_bytes(data=image, mime_type="image/png"),
        f"Use the following description to generate a UI mockup "
        f"that adheres to the provided brand guidelines: {prompt}",
    ],
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(
            aspect_ratio="16:9",
            output_mime_type="image/png",
        ),
    ),
)
```

Write `{random_id}_idea.png` and return that path. The agent must remember the filename for Tool 4.

Course stills (TuringTaste landing, marketing, community feed) show typical image-model **garbled UI text**. Do not treat on-image labels as source of truth; keep real copy in the product UI.

## Tool 4 — `evaluate_image`

Inputs: `threshold`, brand-guide path, generated UI path. **Both images** go to the judge.

Criteria, each 1–5, plus `overall` (average) and `feedback`:

| Criterion | Meaning |
| --- | --- |
| `visual aesthetic` | Appeal and brand alignment (logo, color, type vs the guide) |
| `contrast` | Distinct color, shape, direction |
| `repetition` | Consistent components and patterns |
| `alignment` | Grid and horizontal / vertical flow |
| `proximity` | Related elements grouped |

`pass` is true when `overall >= threshold`. On fail, `feedback` must be **specific prompt changes**. On pass, feedback is `Looks good`.

This is L4’s Gemini judge, pointed at **brand + layout** instead of a golden-retriever brief. Structured JSON via `EvaluationResult` (`scores`, `overall`, `pass`, `feedback`).

## Wiring — `SYSTEM_PROMPT` + `InMemoryRunner`

```text
You are a UI design agent. When asked to create a mockup UI:

1. Call brand_analysis with the user's style guide image …
2. Call generate_design_concepts … two distinct … ideas.
3. For each concept:
   a. generate_idea_image … remember the file name
   b. evaluate_image with a 4.8 threshold
   c. If pass=false, adjust the prompt from feedback and retry
   d. Maximum 1 retry
4. After an image passes, list the image file path.
   A total of two images should pass.
```

```python
agent = Agent(
    name="image_agent",
    model=DLAIGemini(model=TEXT_MODEL_ID),
    tools=[
        brand_analysis,
        generate_design_concepts,
        generate_idea_image,
        evaluate_image,
    ],
    instruction=SYSTEM_PROMPT,
)

runner = InMemoryRunner(agent=agent, app_name="image_agent")
session = await runner.session_service.create_session(
    app_name="image_agent", user_id="user"
)
async for event in runner.run_async(...):
    # print part.text and part.function_call.name
```

The planner model only orchestrates. It does not draw pixels; Tool 3 does.

## Putting it together (course line)

```text
Analyze the guide → write distinct concepts → generate with the
guide as style ref → judge against the same guide → rewrite the
prompt once if the score misses the threshold
```

ADK is the loop. Tools stay small and typed. Retry edits the **prompt**, not a blind resample (same as L2 / L4).

## Mapping to assembly video (do not implement yet)

| Course | App today | Later alignment |
| --- | --- | --- |
| `guide.png` brand DNA | Manual figure / IKEA page as style + BOM ref | Named `brand_analysis`-style extract (palette is less important than part geometry) |
| Two distinct concepts | One prompt per scene | Optional A/B keyframes; still require part identity |
| `generate_idea_image` + style ref | `generateFrame` | Keep L2 keyword expand + reference still |
| `evaluate_image` CRAP + brand, threshold 4.6–4.8 | `evaluateFrame` (similarity, adherence, quality, part identity) | Stack L4 SigLIP / Gecko **and** this generate→judge→rewrite loop |
| Max 1 retry from judge feedback | Up to 3 retries | Prefer prompt rewrite from feedback; do not triple the full stack |
| ADK `InMemoryRunner` | Hard-coded serial `run` | Later: tools for ingest / plan / generate / evaluate / stitch |
| Garbled on-image text | Burned-in captions | Keep step text as overlays, not pixels in the still |

This lesson is why a job feels slow: **two** concepts × (image minutes + judge minutes + optional retry). 63% on a 6-scene job is still mid-pipeline.

Do not invent hardware that is not in the manual. The concept tool must not add core objects the brief did not ask for.

`make_display_tool` in `helper.py` is unused here. Do not invent L6–L8 agent graphs from it.

## Resources

- [Agent Development Kit](https://adk.dev/)
- [Gemini 3.1 Flash Image docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-flash-image)
- [Nano Banana prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
- Local copies: `references/` in this skill folder (`Lesson5.ipynb`, `.bak`, helper, TuringTaste stills)
