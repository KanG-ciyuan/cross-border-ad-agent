# Replaceable Video Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tested, server-only MiniMax H3 and Seedance 2.5 adapters that can create and query asynchronous video-generation tasks without requiring a key for the existing local MVP to run.

**Architecture:** Keep asynchronous external video APIs separate from the synchronous fake renderer. Both adapters implement one provider interface; a server-side factory selects MiniMax by default and can switch to Seedance through configuration. Optional Worker bindings expose configuration state without exposing API keys; live workflow execution remains disabled until a key is configured and a separate persistence/cost step is approved.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, Vitest, Volcano Ark REST API

---

### Task 1: Seedance provider contract and client

**Files:**
- Create: `apps/api/src/providers/seedance.ts`
- Modify: `apps/api/src/providers/types.ts`
- Test: `apps/api/test/seedance-provider.test.ts`

- [ ] **Step 1: Write failing request-shape tests**

Test a provider created with an injected `fetch` implementation. Assert that `createTask` sends a POST request to `/api/v3/contents/generations/tasks`, uses `Authorization: Bearer <key>`, selects `doubao-seedance-2-5-260628`, sends a text content item, maps HTTPS reference images to `reference_image`, and defaults TikTok output to `9:16`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @ad-agent/api test -- seedance-provider.test.ts`

Expected: FAIL because `SeedanceProvider` does not exist.

- [ ] **Step 3: Implement the minimal create-task client**

Add the following public input boundary:

```ts
export interface VideoGenerationInput {
  prompt: string;
  referenceImageUrls: readonly string[];
  referenceVideoUrls?: readonly string[];
  durationSeconds: number;
  ratio?: "9:16" | "16:9" | "1:1";
  resolution?: "720p" | "1080p";
  generateAudio?: boolean;
}
```

Reject blank prompts, non-HTTPS references, unsupported durations, empty provider responses, and malformed task IDs before returning a normalized task.

- [ ] **Step 4: Add failing query and safe-error tests**

Assert that `getTask` performs a GET to the encoded task path and maps `queued`, `running`, `succeeded`, and `failed`. Assert that provider error bodies and authorization headers are never included in thrown error messages.

- [ ] **Step 5: Implement query normalization and safe errors**

Return only the external task ID, normalized status, optional output URL, provider error code, model, duration, ratio, and resolution. Do not return or log raw headers, request bodies, API keys, or provider response bodies.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `pnpm --filter @ad-agent/api test -- seedance-provider.test.ts`

Expected: all Seedance provider tests pass.

### Task 2: Optional server-side configuration and status endpoint

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/wrangler.jsonc`
- Create: `apps/api/src/integrations/routes.ts`
- Test: `apps/api/test/integrations.test.ts`
- Test: `apps/api/test/bindings.test.ts`

- [ ] **Step 1: Write failing configuration-status tests**

Assert that an authenticated `GET /api/integrations/seedance` returns `{ configured: false }` when `ARK_API_KEY` is absent, and `{ configured: true, model: "doubao-seedance-2-5-260628" }` when present. Assert that unauthenticated callers receive 401 and the response never contains key material.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @ad-agent/api test -- integrations.test.ts bindings.test.ts`

Expected: FAIL because the integration route and optional bindings do not exist.

- [ ] **Step 3: Add optional bindings and the authenticated route**

Add `ARK_API_KEY?: string` and `SEEDANCE_MODEL_ID?: string` to `Env`. Keep `ARK_API_KEY` optional so local fake-provider development still starts without it. Add only the non-secret default model ID to committed Wrangler vars. The route must return configuration state, never the key value.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @ad-agent/api test -- integrations.test.ts bindings.test.ts`

Expected: all configuration and binding tests pass.

### Task 3: MiniMax H3 adapter and provider selection

**Files:**
- Create: `apps/api/src/providers/minimax.ts`
- Create: `apps/api/src/providers/video-generation.ts`
- Test: `apps/api/test/minimax-provider.test.ts`
- Test: `apps/api/test/video-generation-provider.test.ts`

- [ ] **Step 1: Write failing MiniMax request and query tests**

Assert the official `POST https://api.minimax.io/v2/video_generation` request shape, `MiniMax-H3` model name, `9:16` and `768P` defaults, multimodal reference roles, and `GET /v2/query/video_generation/{task_id}` response normalization.

- [ ] **Step 2: Implement the MiniMax adapter**

Validate the official 4-15 second duration range, at most 9 images and 3 videos, HTTPS reference URLs, safe provider errors, and `402` insufficient-balance handling.

- [ ] **Step 3: Add the unified provider factory**

Select `minimax` by default through `VIDEO_GENERATION_PROVIDER`, allow `seedance`, and fail closed when the selected provider key is missing.

- [ ] **Step 4: Verify provider selection**

Run: `pnpm --filter @ad-agent/api test -- minimax-provider.test.ts video-generation-provider.test.ts integrations.test.ts`

Expected: all provider and configuration tests pass.

### Task 4: Verification and operator handoff

**Files:**
- Modify: `docs/architecture/mvp-foundation-verification.md`

- [ ] **Step 1: Document the exact verified boundary**

Record the official create/query endpoints, default model ID, server-only secret name, 24-hour output URL lifetime, and the fact that tests use injected fake HTTP responses. State that no live Seedance request or charge has occurred.

- [ ] **Step 2: Run complete verification**

Run: `pnpm test && pnpm typecheck && pnpm build && git diff --check`

Expected: exit code 0 for all commands.

- [ ] **Step 3: Confirm secret safety**

Run a scoped repository search for `ARK_API_KEY`, authorization headers, `.dev.vars`, and secret-looking values. Confirm only variable names, test placeholders, and ignored local files appear; do not print `.dev.vars` content.

- [ ] **Step 4: Commit the integration foundation**

```bash
git add apps/api docs/architecture docs/superpowers/plans/2026-08-25-seedance-provider-integration.md
git commit -m "feat: add Seedance provider integration"
```
