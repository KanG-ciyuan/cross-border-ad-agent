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

## Simulated boundaries

- Analysis and rendering use deterministic fake providers. The render receipt is structured test data, not a playable video file.
- Demo browser flows use `?demo=1` and sample data so UI behavior can be verified without a local company account.
- The review player, generated reference images, storyboard visuals, Indonesian copy, and retry-shot action remain illustrative UI. They are not outputs from Seedance or a real renderer.

## Not yet verified

- A real local company login has not been accepted in the browser because `apps/api/.dev.vars` and a local authorized user have not been configured. Password entry must be performed by the user in the hidden TTY prompt.
- Cross-device persistence through a deployed Cloudflare Worker, remote D1, and remote R2 is unverified. No Cloudflare resource was created or changed and no deployment was performed.
- Existing tasks created before migration `0002_task_input.sql` contain no reconstructable product facts. They must be recreated before analysis; the migration deliberately does not invent product claims or compliance data.
- Seedance, TTS, real image/video generation, Remotion/FFmpeg rendering, Jianying automation, TikTok publishing, provider pricing, and provider concurrency are not connected or verified.
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
