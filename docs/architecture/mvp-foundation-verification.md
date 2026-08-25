# MVP Foundation Verification

Date: 2026-08-25

This report covers local acceptance only. It is not evidence of production readiness or a Cloudflare deployment.

## Verified locally

- The browser checks the real session endpoint, submits the company email/password login form, and uses the task API after authentication. E2E uses narrowly scoped login/session/list mocks; API authentication and 401 behavior are covered separately by integration tests.
- Task creation persists the complete input in local D1. Uploaded files stream into local R2 with file type and 25 MB size enforcement.
- The deterministic fake analysis provider creates and persists an edit plan. Complete-creation tasks require reference, storyboard, cost, and risk approvals before render.
- The deterministic fake render path persists a new version, one RMB cost entry, a render receipt, content review, and final approval.
- Render reservation is idempotent. A losing concurrent request does not run the provider. A provider failure marks the attempt failed and the task retryable; a new request can retry without charging the failed attempt.
- The web task list, confirmation screen, review screen, and version table read current API task data. The edit-only flow bypasses reference/storyboard generation and exposes only the selected editing operations.
- Playwright checks complete-creation and edit-only demo flows in desktop Chromium at `1440 x 900` and mobile Chromium at `390 x 844`, including interaction, console errors, and root-level horizontal overflow.
- A real local company account has logged in through the browser. The session remains authenticated after refresh, and the real task list and create-task form load without console errors.
- The server-only Seedance 2.5 adapter builds official Volcano Ark create requests and normalizes task-query responses. Tests cover request shape, TikTok `9:16` defaults, HTTPS reference validation, response validation, and secret-safe provider errors using injected fake HTTP responses.
- The server-only MiniMax H3 adapter builds the official V2 multimodal request and normalizes task-query responses. Tests cover `9:16` and `768P` defaults, official duration/reference limits, insufficient balance, provider failures, and secret-safe errors using injected fake HTTP responses.
- A shared provider factory selects MiniMax by default and can switch to Seedance through `VIDEO_GENERATION_PROVIDER`. Authenticated integration status reports provider configuration without returning `MINIMAX_API_KEY`, `ARK_API_KEY`, or other secret material. The existing local fake-provider workflow remains available when keys are absent.

## Simulated boundaries

- Analysis and rendering use deterministic fake providers. The render receipt is structured test data, not a playable video file.
- Demo browser flows use `?demo=1` and sample data so UI behavior can be verified without a local company account.
- The review player, generated reference images, storyboard visuals, Indonesian copy, and retry-shot action remain illustrative UI. They are not outputs from Seedance or a real renderer.

## Seedance integration boundary

- Official create endpoint: `POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`.
- Official query endpoint: `GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`.
- Default model ID: `doubao-seedance-2-5-260628`.
- The API key binding name is `ARK_API_KEY`; it is optional for local fake-provider work and must be supplied only through `.dev.vars` or the Cloudflare secret store.
- Official documentation states that completed video URLs expire after 24 hours, so a later workflow step must copy successful output into R2 before expiry.
- No live Seedance request has been sent, no generated video has been downloaded, and no Seedance charge has been incurred during this verification.

## MiniMax H3 integration boundary

- Domestic create endpoint: `POST https://api.minimaxi.com/v2/video_generation`.
- Domestic query endpoint: `GET https://api.minimaxi.com/v2/query/video_generation/{task_id}`.
- Model ID: `MiniMax-H3`; the server-side key binding name is `MINIMAX_API_KEY`.
- The adapter defaults to TikTok `9:16`, 768P, and accepts the official 4-15 second integer duration range. It supports up to 9 reference images and up to 3 reference videos.
- Official pay-as-you-go pricing observed on 2026-08-25 was USD 0.08 per output second for 768P and USD 0.13 per output second for 2K, excluding chargeable extra reference images or input-video duration. Pricing must be refreshed before production budgeting.
- No live MiniMax request has been sent, no generated video has been downloaded, and no MiniMax charge has been incurred during this verification.

## Not yet verified

- Cross-device persistence through a deployed Cloudflare Worker, remote D1, and remote R2 is unverified. No Cloudflare resource was created or changed and no deployment was performed.
- Existing tasks created before migration `0002_task_input.sql` contain no reconstructable product facts. They must be recreated before analysis; the migration deliberately does not invent product claims or compliance data.
- Live MiniMax/Seedance execution and output persistence, TTS, real image generation, Remotion/FFmpeg rendering, Jianying automation, TikTok publishing, and provider concurrency are not verified.
- No credentials were read, displayed, moved, replaced, or committed.

## Commands

Run from the repository root:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git diff --check
```

Playwright starts an isolated Vite server at `http://127.0.0.1:4187`. Test screenshots and traces are generated under ignored Playwright output directories.
