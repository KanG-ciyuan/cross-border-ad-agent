# MVP Foundation Verification

Date: 2026-08-25

This report covers local acceptance of the Vite demo. It is not evidence of production readiness or a Cloudflare deployment.

## Verified locally

- Playwright exercises the complete-creation path from product input and fixture upload through all generation confirmations, simulated review, content approval, final approval, and a visible RMB-costed version.
- Playwright exercises edit-only selection, fixture upload, removal of product/generation controls, selection of trim/concat/captions only, and direct navigation to review.
- The existing component test verifies that the edit-only submit payload excludes `product` and `referenceGeneration`; the Vite demo itself does not send a task API request.
- The built-in sample review route can be opened in a fresh demo browser context.
- Desktop Chromium at `1440 x 900` and mobile Chromium at `390 x 844` are checked for root-level horizontal overflow and browser console/page errors.
- Playwright stores explicit full-page screenshots under `apps/web/test-results/<project>/<test>/` and failure screenshots, traces, and videos in the same ignored test artifact tree. The HTML report is stored under `apps/web/playwright-report/`. Both locations are ignored by Git.

## Simulated boundaries

- The browser demo is enabled with `?demo=1` and uses fixed sample tasks plus React in-memory state from `apps/web/src/app/router.tsx`.
- Product analysis, reference images, storyboard output, video output, retry behavior, costs, approvals, and versions displayed by the browser are simulated examples.
- API provider tests use deterministic fake analysis and rendering providers. They do not prove external model or rendering service behavior.

## Unverified

- A task created in the Vite demo does not survive a reload, a fresh browser context, or another device. The real cross-device/session recovery assertion is explicitly skipped until the frontend is connected to the D1-backed task API.
- Cloudflare Workers, D1, R2, preview environments, production deployment, bindings, quotas, recovery, and observability have not been exercised by this acceptance run.
- Seedance integration, TTS integration, real image/video generation, Remotion/FFmpeg rendering, Jianying automation, TikTok publishing, and real provider pricing or concurrency have not been verified.
- No Cloudflare resources were created, no deployment was performed, and no credentials were read or changed for this verification.

## Commands

Run from the repository root:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The Playwright command starts the existing Vite demo locally at `http://127.0.0.1:4187` for the duration of the test run.
