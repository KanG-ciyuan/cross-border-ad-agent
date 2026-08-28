# AdFlow Agent Harness Runtime

## Current boundary

AdFlow uses a provider-independent Harness instead of making a Codex chat session the production runtime.

```text
Browser canvas
  -> authenticated task API
  -> Agent Harness
  -> typed Skill
  -> model/tool Provider
  -> versioned D1 result + optional media asset
  -> human approval
```

Codex can be plugged in as a planner Provider. Task ownership, idempotency, retries, version history and approvals remain in the AdFlow runtime so a closed browser or replaced model does not lose workflow state.

## Runtime modes

### Local development

- Vite serves the browser workbench.
- Wrangler runs the Hono API with local D1. Object storage is an optional capability.
- `.dev.vars` supplies local secrets and is never committed.
- Long media rendering can run in a separate local renderer process.

### Cross-device cloud runtime

- Cloudflare serves the web application and authenticated API.
- D1 stores tasks, Harness attempts, product analyses, approvals and versions.
- The current product-image MVP sends image bytes through one authenticated Worker request and does not persist the original image in cloud object storage.
- D1 stores the analysis JSON, approval state, attempts, and usage records. A transient opaque source ID preserves analysis lineage without storing image bytes.
- R2 or another object store remains an optional later capability for cross-device asset recovery, generated media, and video-editing inputs/outputs.
- External model APIs perform multimodal analysis, image generation and MiniMax video generation.
- A queue or durable workflow runtime is required before long-running unattended production is enabled.
- FFmpeg/Remotion and a future Jianying adapter run outside ordinary Workers when persistent compute is required.

## First real acceptance flow

The first implemented real flow is:

```text
Create product-image task
  -> send product image bytes in the authenticated analysis request
  -> start product-image-analysis Skill
  -> call an OpenAI-compatible multimodal endpoint
  -> validate product_analysis.v1
  -> persist immutable analysis version
  -> discard request image bytes after the model call
  -> display fact candidates in the canvas
  -> operator confirms the exact analysis snapshot
```

The model output is always a candidate. It cannot set `requiresHumanConfirmation` to false, approve inferred side/back packaging, or write directly into confirmed downstream facts.

## Product vision configuration

The backend reads these bindings:

- `PRODUCT_VISION_PROVIDER`
- `PRODUCT_VISION_BASE_URL`
- `PRODUCT_VISION_MODEL_ID`
- `PRODUCT_VISION_API_KEY`

The first supported provider value is `openai_compatible`. The API Key must be stored in `.dev.vars` locally or managed cloud secret storage. The configuration status endpoint exposes only provider name, model name and configured state; it never returns the Key or gateway address.

## Still pending

- Deterministic resolution, blur and exposure inspection before model analysis.
- Image enhancement/generation Provider and confirmed product-master asset.
- Character, scene and multiview asset Skills.
- Script and shot-prompt Skills.
- MiniMax per-shot task orchestration and callback/poll recovery.
- Cloud queue/durable workflow implementation.
- Server-side persistence of the entire canvas graph; current node layout persistence remains browser-local.
