# MVP Foundation Verification

Date: 2026-08-25

This report covers local acceptance of the Vite demo. It is not evidence of production readiness or a Cloudflare deployment.

## Verified locally

- Playwright exercises the complete-creation path from product input and fixture upload through all generation confirmations, simulated review, content approval, final approval, and a visible RMB-costed version.
- Playwright exercises edit-only selection, fixture upload, removal of product/generation controls, selection of trim/concat/captions only, and direct navigation to review.
- The complete-creation and edit-only scenarios exercise the login form and verify the submitted email/password request shape with only `POST /api/auth/login` mocked to return success.
- The built-in sample review route can be opened in a fresh demo browser context.
- Desktop Chromium at `1440 x 900` and mobile Chromium at `390 x 844` are checked for root-level horizontal overflow and browser console/page errors.
- Playwright stores explicit screenshots under `apps/web/test-results/<spec-and-test-slug>-<project-name>/<screenshot-name>.png`. Current examples are `apps/web/test-results/complete-creation-complete-bf3d5-ches-a-costed-final-version-desktop-chromium/complete-creation-final.png` and `apps/web/test-results/edit-only-edit-only-remove-b79ec--submits-directly-to-review-mobile-chromium/edit-only-review.png`. Failure screenshots, traces, and videos use the same ignored combined test/project directory pattern. The HTML report is stored under `apps/web/playwright-report/`.

## Simulated boundaries

- After the mocked login response, the browser uses fixed sample tasks plus React in-memory state from `apps/web/src/app/router.tsx`. The direct built-in recovery check uses `?demo=1` to create a fresh simulated context.
- Product analysis, reference images, storyboard output, video output, retry behavior, costs, approvals, and versions displayed by the browser are simulated examples.
- API provider tests use deterministic fake analysis and rendering providers. They do not prove external model or rendering service behavior.

## Unverified

- A task created in the Vite demo does not survive a reload, a fresh browser context, or another device. The real cross-device/session recovery assertion is explicitly skipped until the frontend is connected to the D1-backed task API.
- The edit-only task API payload assertion is explicitly skipped. The UI strips generation and product controls, and a component test covers its callback payload, but the frontend does not issue a task API request; therefore exclusion of generation, product, claim, and extra-copy fields at the HTTP boundary is unverified.
- Real backend login, cookie issuance, session persistence, expiry, and authorization integration are unverified; the acceptance test verifies only the login UI and request shape against a mocked successful response.
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
