---
name: google-media-l8-infographic-agent
description: Google L8 infographic agent built with Gemini CLI — fetch a blog, Nano Banana still, Gemini PASS/feedback judge, max 3 prompt-rewrite retries, LlmAgent + one coarse workflow tool. Use when scaffolding an ADK media agent, logging a generate-eval loop, or applying the course nano-banana / adk-agent-creator skills.
---

# L8 — Media agent build with AI

Source: DeepLearning.AI / Google `Lesson8.ipynb` plus the two skills shipped in that lab (`nano-banana-image-gen`, `adk-agent-creator`). Notebook subtitle: *This is the agent built in the past lesson using GeminiCLI.*

There is **no L7 notebook**. L7 was the Gemini CLI authoring session. L8 runs the agent that session produced.

Do not change the assembly-video app from this skill alone. The uploaded lesson set is L2–L6 + L8. Apply course practices only after the user says the set is ready or asks to implement.

## What the lab builds

An **infographic** agent, not a video agent. Input is a blog URL. Output is a PNG that must PASS a Gemini judge.

Lab URL:

```text
https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-lyria-3-pro
```

Lyria 3 Pro is Google’s **music** model. The agent’s job is to illustrate that post, not to generate audio. The first still in `references/infographic-attempt1-fail.png` failed because it treated Lyria like a text LLM (duplicate “Providing context”, “code / email / story”). The second still, `infographic-attempt2-pass.png`, is music-specific (genre, tempo, instrumentation, production, few-shot) and the log marks **PASS**.

On-image text is still garbled. The judge looks for structure, domain fit, and obvious typos — not pixel-perfect spelling of every label.

## Models (July 2026 notebook)

| Role | ID |
| --- | --- |
| Image (Nano Banana) | `gemini-3.1-flash-image` |
| Judge + orchestrator | `gemini-3-flash-preview` |
| Agent type | `google.adk.agents.llm_agent.LlmAgent` |
| Runtime | `InMemoryRunner` (`app_name="image_agent"`) |

The course `nano-banana-image-gen` skill still names `gemini-3.1-flash-image-preview`. The notebook migration note: same model, new endpoint. Prefer `gemini-3.1-flash-image`.

Auth is the same Vertex `authenticate()` + `DLAIGemini` 600s client as L5.

## Lesson pattern: one coarse tool owns the loop

L5/L6 gave the planner many small tools. L8 hides fetch → generate → evaluate → retry **inside** `infographic_workflow(url)`. The ADK agent has that single tool.

```text
user: Create an infographic from this blog: {URL}
  → infographic_workflow(url)
       fetch_blog_content          # GET, first 5000 chars
       for attempt in 1..3:
         generate_infographic      # Nano Banana, append prior feedback
         evaluate_infographic      # factual / spelling / aesthetics
         if result == "PASS": return path
         else: feedback = judge text
       return last path
```

Every step appends to `infographic_agent.log` with an ISO timestamp (`log_step`).

## Tools inside the workflow

### `fetch_blog_content(url)`

`requests.get(url, timeout=10)`, then `response.text[:5000]`. Heuristic HTML, not a clean extract. Errors return `"Error: …"` and abort the workflow.

### `generate_infographic(blog_content, feedback="")`

```python
prompt = f"Create a professional infographic based on this blog content: {blog_content}."
if feedback:
    prompt += f" Please fix the following issues from the previous attempt: {feedback}"

client.models.generate_content(
    model="gemini-3.1-flash-image",
    contents=prompt,
    config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
)
```

Save `infographic_%Y%m%d_%H%M%S.png`. No style-reference image and no `ImageConfig` aspect ratio in this cell.

### `evaluate_infographic(image_path, blog_content)`

Pass the PIL image + the same 5000-char blog slice to `gemini-3-flash-preview`. Criteria:

1. **Factual accuracy** — represents the post (right product, no duplicate sections)
2. **Spelling** — typos in on-image text
3. **Aesthetic alignment** — professional blog look (no gibberish chrome)

If any criterion fails: specific feedback. If all pass: respond **ONLY** with `PASS`.

The sample log’s fail reasons match the first still: duplicate step 3, Lyria given LLM tips, `few-shot prom]`, garbled background code. Attempt 2 of 3 returned `PASS`.

### `infographic_workflow(url)` → ADK tool

`max_attempts = 3`. Retry **rewrites the image prompt** with the judge text (same as L2/L5). After three misses, return the last file and tell the operator to read the log.

## Wiring

```python
root_agent = LlmAgent(
    name="InfographicAgent",
    model=DLAIGemini(model="gemini-3-flash-preview"),
    instruction=(
        "You are an expert at creating infographics from blog posts. "
        "Use the tools provided to fetch content, generate an image, and validate it. "
        "Always log your progress."
    ),
    tools=[infographic_workflow],
)

runner = InMemoryRunner(agent=root_agent, app_name="image_agent")
# user text: Create an infographic from this blog: {BLOG}
```

The planner only decides to call the workflow. It does not step through generate vs evaluate.

## Course skills shipped with the lab (L7 Gemini CLI)

These are how the previous lesson *authored* the agent. Keep them as Cursor skills; verbatim copies also live under `references/skills/`.

### `nano-banana-image-gen`

- `pip install -U google-genai`
- `genai.Client(vertexai=True, project=…, location="global")`
- Text-to-image with `response_modalities=["IMAGE"]`
- Conversational edit: `[PIL image, "Change the sky…"]`
- Family note in that skill: Flash Image (speed), `gemini-3.1-flash-image-preview` (fidelity; **retired name** → `gemini-3.1-flash-image`), Pro Image (reasoning), `gemini-3-flash-preview` (analysis)

### `adk-agent-creator`

- Python 3.10+, `pip install google-adk`
- `adk create [agent_name]` → `agent.py` + `.env`
- Vertex env: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI=TRUE`, location `global`
- `LlmAgent` / `Agent` with `gemini-3-flash-preview` and tools
- `adk run [agent_name]` or `adk web --port 8000`

L8’s notebook is the **result** of that CLI session: one `LlmAgent`, one workflow tool, Vertex client, Nano Banana generate, Gemini judge.

## Lyria 3 Pro (the blog topic, not the L8 output)

Official formula from the [Lyria 3 Pro prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-lyria-3-pro):

```text
[Genre and style] + [Mood] + [Instrumentation] + [Tempo and rhythm]
  + [Vocal style & language] + [Lyrics]
```

- Lyria 3: ~30s tracks. Lyria 3 Pro: up to ~3 min, timed lyrics, tempo in natural language.
- Multimodal: text, PDF, or up to 10 reference images.
- Google’s later pipeline: Nano Banana storyboard → Veo picture → **Lyria score**. L2 already named that chain. L8 does not call Lyria.

## Putting it together (course line)

```text
Fetch a source of truth
  → generate a still
  → judge against that source (PASS or concrete fixes)
  → rewrite the prompt with the judge text
  → cap retries and keep a timestamped log
```

Prefer a **domain-correct** second attempt over resampling the same wrong brief (music tips, not “write code / email”).

## Mapping to assembly video (do not implement yet)

| Course | App today | Later alignment |
| --- | --- | --- |
| Blog URL as source of truth | Uploaded manual / IKEA PDF | Same idea: judge against the manual, not a generic pretty picture |
| One coarse `infographic_workflow` | Hard-coded serial `run` | Either keep a workflow tool or L6’s per-scene tools; do not mix both blindly |
| PASS / written feedback, 3 attempts | Numeric still rubric, up to 3 retries | Keep numeric L4/L6 scores; add a hard PASS on part identity + “wrong product” like the Lyria-vs-LLM fail |
| Prompt += judge feedback | Retry often resamples | Always append judge text (L5/L8) |
| `infographic_agent.log` | Job JSON / progress % | Persist per-attempt judge text the way the log does |
| Gemini CLI + reusable skills | Hand-written agent | Skills are for *authoring*; runtime is ADK |
| Image-only, no Veo | Frames + Ken Burns / Sora | L6 remains the video loop; L8 is the generate–eval–log shape |
| Garbled labels | Burned-in captions | Keep step text as overlays |

Do not add a Lyria soundtrack unless asked. L8 never generates music.

## Resources

- [ADK](https://adk.dev/)
- [Nano Banana prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
- [Lyria 3 Pro prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-lyria-3-pro) (lab source URL)
- Local copies: `references/` in this skill folder
