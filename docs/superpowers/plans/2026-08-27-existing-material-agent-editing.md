# Existing-Material Agent Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build production line A so Codex Agent can understand complete uploaded videos, produce an auditable multi-ratio edit plan, render a complete low-resolution preview, accept natural-language revisions, and deliver a human-approved final video.

**Architecture:** Keep the existing Hono/Cloudflare API, shared Zod contracts, repository, React/Vite workbench, and standalone renderer. Replace the production path's deterministic analysis with an injected `AnalysisProvider` that combines deterministic media inspection, ASR/OCR/vision adapters, and an Agent planner; persist `analysis_map.v1` and `edit_plan.v1` before rendering. The renderer accepts only validated plans and uses FFmpeg + Remotion-compatible composition for preview, with a separate adapter boundary for the future Jianying desktop executor.

**Tech Stack:** TypeScript, Hono, Cloudflare Worker/D1/R2, React/Vite, Zod, Vitest, Playwright, FFmpeg, Remotion-compatible render boundary.

---

## Scope and invariants

- This plan covers production line A only. Product-image generation, MiniMax shot generation, TTS provider implementation, TikTok publishing, and Jianying desktop automation are separate plans.
- The user enters target duration and output ratio per task. Do not hard-code 30/45 seconds or 9:16.
- Natural language is primary input. Do not reintroduce duplicate operation checkboxes into the normal flow.
- Uploads are not blocked by a rights confirmation step. Risk findings are surfaced for review.
- No untrusted estimated cost is shown. Record actual provider usage only when the provider returns a trustworthy amount; otherwise record calls and status.
- The Agent chooses and explains clips. FFmpeg, Remotion, and Jianying execute an approved plan only.
- Every implementation task must use TDD: write a failing test, run it and observe the expected failure, implement the smallest passing change, run focused and regression tests, then commit.

## File map

- `packages/contracts/src/analysis-map.ts`: versioned full-video analysis map, segment evidence, confidence, risk and value labels.
- `packages/contracts/src/edit-plan.ts`: ratio-aware, cost-free edit protocol with per-shot source windows, tracks, processing decisions and approval references.
- `packages/contracts/src/task.ts`: natural-language edit requirements, target ratio, must-use clips and edit-only fields.
- `packages/workflow/src/state-machine.ts`: A-line states for analysis, plan approval, preview, revision, final render and final approval.
- `apps/api/src/providers/types.ts`: replaceable media analysis, Agent planning and render interfaces.
- `apps/api/src/providers/media-analysis.ts`: deterministic orchestration of probe, ASR, OCR and vision adapters into `analysis_map.v1`.
- `apps/api/src/providers/agent-edit-planner.ts`: Agent prompt/context assembly and validated `edit_plan.v1` output.
- `apps/api/src/providers/provider-factory.ts`: server-only provider selection; fake mode is explicit test/demo fallback.
- `apps/api/src/tasks/routes.ts`: analysis, plan approval, preview render, natural-language revision and final approval endpoints.
- `apps/api/src/tasks/repository.ts`: persistence for analysis maps, plan versions, approvals, render attempts and actual usage records.
- `apps/renderer/src/ffmpeg-renderer.ts`: validated clip normalization, aspect-ratio adaptation and preview/final rendering primitives.
- `apps/renderer/src/server.ts`: render request validation and output delivery for multiple ratios.
- `apps/web/src/features/tasks/`: upload, requirements interpretation, analysis map, edit plan, preview/revision and final review surfaces.
- `apps/web/e2e/edit-only.spec.ts`: end-to-end A-line flow with real fixture videos and explicit demo-provider labeling.
- `docs/architecture/mvp-foundation-verification.md`: verified/simulated/unverified boundary after each milestone.

### Task 1: Replace the old edit protocol with `analysis_map.v1` and cost-free `edit_plan.v1`

**Files:**
- Create: `packages/contracts/src/analysis-map.ts`
- Modify: `packages/contracts/src/edit-plan.ts`
- Modify: `packages/contracts/src/task.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/contracts.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests for: full-video segments with `startMs`, `endMs`, `sourceAssetId`, `valueLabel`, confidence, ASR/OCR findings and risk findings; target ratio `9:16` and `16:9`; must-use clip IDs; and an edit plan that contains no `estimatedFen`, `limitFen`, or arbitrary provider command.

```ts
it("accepts a complete analysis map with evidence and confidence", () => {
  expect(AnalysisMapV1.parse(fixtureAnalysisMap).version).toBe("analysis_map.v1");
});

it("accepts user-selected ratios and rejects invalid plan output", () => {
  expect(EditPlanV1.parse({ ...fixturePlan, output: { ...fixturePlan.output, ratio: "16:9" } })).toBeTruthy();
  expect(() => EditPlanV1.parse({ ...fixturePlan, cost: { estimatedFen: 1 } })).toThrow();
});
```

- [ ] **Step 2: Run focused tests and observe the expected failure**

Run: `pnpm --filter @ad-agent/contracts test -- contracts.test.ts`

Expected: FAIL because `AnalysisMapV1` and the new ratio/plan fields do not exist and the old cost shape is still required.

- [ ] **Step 3: Implement the minimal schemas**

Define strict Zod objects for evidence, confidence `[0,1]`, segment value labels (`high`, `usable`, `repeated`, `low_quality`, `risk`), optional ASR/OCR/vision findings, `OutputRatio`, and `EditPlanV1` without estimated-cost fields. Keep approval kinds limited to business approvals and include a `planHash` reference in receipts.

- [ ] **Step 4: Run focused and package tests**

Run: `pnpm --filter @ad-agent/contracts test -- contracts.test.ts && pnpm --filter @ad-agent/contracts typecheck`

Expected: PASS with no schema or type errors.

- [ ] **Step 5: Commit the protocol boundary**

```bash
git add packages/contracts/src/analysis-map.ts packages/contracts/src/edit-plan.ts packages/contracts/src/task.ts packages/contracts/src/index.ts packages/contracts/src/contracts.test.ts
git commit -m "feat: define video analysis and ratio-aware edit protocols"
```

### Task 2: Add A-line workflow states and persistence

**Files:**
- Modify: `packages/workflow/src/state-machine.ts`
- Modify: `packages/workflow/src/workflow.test.ts`
- Modify: `apps/api/src/tasks/repository.ts`
- Modify: `apps/api/src/tasks/routes.ts`
- Test: `apps/api/test/tasks-api.test.ts`

- [ ] **Step 1: Write failing state and persistence tests**

Cover `uploaded -> analyzing -> awaiting_plan_approval -> previewing -> awaiting_preview_review -> final_rendering -> awaiting_final_approval -> approved`, rejection to `revision_requested`, retry from `failed_retryable`, and idempotent persistence of analysis/plan/approval attempts.

```ts
it("requires plan approval before preview rendering", () => {
  expect(() => transition("analyzing", "start_preview")).toThrow();
  expect(transition("awaiting_plan_approval", "approve_plan")).toBe("previewing");
});
```

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --filter @ad-agent/workflow test -- workflow.test.ts && pnpm --filter @ad-agent/api test -- tasks-api.test.ts`

Expected: FAIL because the A-line states and repository records are absent.

- [ ] **Step 3: Implement state transitions and repository methods**

Add repository methods `saveAnalysisMap`, `getLatestAnalysisMap`, `saveEditPlanVersion`, `savePlanRevision`, `saveRevisionRequest`, `getLatestApproval`, and `saveUsageRecord`. Ensure every mutating route requires `Idempotency-Key`; return the existing attempt for a repeated key and never create a second render attempt.

- [ ] **Step 4: Run focused and regression tests**

Run: `pnpm --filter @ad-agent/workflow test && pnpm --filter @ad-agent/api test -- tasks-api.test.ts repositories.test.ts`

Expected: PASS; repeated requests return the original attempt ID and no client-supplied cost fields are accepted.

- [ ] **Step 5: Commit workflow persistence**

```bash
git add packages/workflow/src/state-machine.ts packages/workflow/src/workflow.test.ts apps/api/src/tasks/repository.ts apps/api/src/tasks/routes.ts apps/api/test/tasks-api.test.ts
git commit -m "feat: persist agent editing workflow states"
```

### Task 3: Build the replaceable full-video analysis provider

**Files:**
- Modify: `apps/api/src/providers/types.ts`
- Create: `apps/api/src/providers/media-analysis.ts`
- Create: `apps/api/src/providers/analysis-adapters.ts`
- Create: `apps/api/src/providers/provider-factory.ts`
- Modify: `apps/api/src/providers/fake-analysis.ts`
- Test: `apps/api/test/media-analysis-provider.test.ts`

- [ ] **Step 1: Write failing provider tests**

Test that the orchestrator probes every source video, creates timestamped segments, merges ASR/OCR/vision findings, assigns confidence/value labels, preserves low-confidence findings for review, and never calls external providers in explicit `demo` mode.

```ts
it("builds a value map from full coverage and denser keyframe analysis", async () => {
  const result = await provider.analyze({ ...input, assets: [videoA, videoB] });
  expect(result.version).toBe("analysis_map.v1");
  expect(result.segments.every((segment) => segment.startMs < segment.endMs)).toBe(true);
  expect(result.segments.some((segment) => segment.risks.some((risk) => risk.kind === "watermark"))).toBe(true);
});
```

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --filter @ad-agent/api test -- media-analysis-provider.test.ts`

Expected: FAIL because the new provider and adapters do not exist.

- [ ] **Step 3: Implement adapter contracts and deterministic orchestration**

Define injected adapters for media probe, ASR, OCR, and multimodal segment interpretation. The orchestrator must read all source durations, analyze scene/action boundaries, add denser keyframes around product/action/contrast changes, merge evidence by time window, and classify risks without deleting low-confidence results. Keep provider errors secret-safe.

- [ ] **Step 4: Make fake analysis explicit**

Expose `ANALYSIS_PROVIDER=demo` only for tests and local demo fixtures. Production factory selection must fail closed when a real provider is selected but its server-side configuration is missing; do not silently fall back to `FakeAnalysisProvider`.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm --filter @ad-agent/api test -- media-analysis-provider.test.ts integrations.test.ts && pnpm --filter @ad-agent/api typecheck`

Expected: PASS; no API key value appears in errors or logs.

- [ ] **Step 6: Commit the analysis boundary**

```bash
git add apps/api/src/providers apps/api/test/media-analysis-provider.test.ts
git commit -m "feat: add replaceable full-video analysis provider"
```

### Task 4: Add Agent planning from requirements plus analysis map

**Files:**
- Create: `apps/api/src/providers/agent-edit-planner.ts`
- Modify: `apps/api/src/providers/types.ts`
- Modify: `apps/api/src/tasks/routes.ts`
- Test: `apps/api/test/agent-edit-planner.test.ts`

- [ ] **Step 1: Write failing planner tests**

Test that the planner receives natural-language requirements, target duration, target ratio, must-use clip IDs, product facts and the analysis map; selects clips with reasons; preserves must-use clips; may omit repeated/low-value clips; creates audio/caption/graphics decisions; and returns a schema-valid plan with no estimated cost.

```ts
it("rebuilds a new ad structure instead of alternating source videos", async () => {
  const plan = await planner.plan({ ...requirements, targetDurationSeconds: 30, ratio: "16:9" }, analysisMap);
  expect(plan.output.ratio).toBe("16:9");
  expect(plan.tracks.find((track) => track.type === "video")?.clips.length).toBeGreaterThan(1);
  expect(plan.explanations.every((item) => item.reason.length > 0)).toBe(true);
});
```

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --filter @ad-agent/api test -- agent-edit-planner.test.ts`

Expected: FAIL because the Agent planner contract and implementation do not exist.

- [ ] **Step 3: Implement bounded planner input/output**

Assemble a compact context containing the user requirement, hard constraints, segment evidence, must-use IDs and platform guidance. Instruct the Agent to return JSON only, validate with `EditPlanV1`, reject out-of-range windows, missing source IDs, duration mismatches and unapproved arbitrary operations, then return a human-readable explanation list alongside the plan.

- [ ] **Step 4: Add revision planning**

Implement `revisePlan({ currentPlan, userInstruction, analysisMap })` that identifies affected shots/tracks, returns a new plan version and a diff (`added`, `removed`, `moved`, `durationChanged`, `audioChanged`, `captionChanged`). Do not mutate the previous version.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @ad-agent/api test -- agent-edit-planner.test.ts tasks-api.test.ts && pnpm --filter @ad-agent/api typecheck`

Expected: PASS; revision output references a new version and keeps the old plan recoverable.

- [ ] **Step 6: Commit Agent planning**

```bash
git add apps/api/src/providers/agent-edit-planner.ts apps/api/src/providers/types.ts apps/api/src/tasks/routes.ts apps/api/test/agent-edit-planner.test.ts
git commit -m "feat: plan edits with agent reasoning and revisions"
```

### Task 5: Implement ratio-aware preview rendering

**Files:**
- Modify: `apps/renderer/src/ffmpeg-renderer.ts`
- Modify: `apps/renderer/src/server.ts`
- Modify: `apps/renderer/test/ffmpeg-renderer.test.ts`
- Test: `apps/renderer/test/render-ratio.test.ts`

- [ ] **Step 1: Write failing rendering tests**

Cover 9:16 and 16:9 output, no stretching, crop/contain behavior, clip duration preservation, muted original audio, and stable caption safe-zone placement.

```ts
it("renders a 16:9 plan without stretching the source subject", async () => {
  const receipt = await renderFixture({ ratio: "16:9" });
  expect(receipt.width / receipt.height).toBeCloseTo(16 / 9, 2);
});
```

- [ ] **Step 2: Run focused tests and observe the expected failure**

Run: `pnpm --filter @ad-agent/renderer test -- render-ratio.test.ts ffmpeg-renderer.test.ts`

Expected: FAIL because the server currently requires 1080x1920 and the renderer uses a fixed crop.

- [ ] **Step 3: Implement validated ratio profiles**

Map ratio to explicit width/height profiles, use crop or contain only as selected by the approved plan, preserve subject-safe regions, and position captions/graphics from the profile rather than fixed 9:16 coordinates. Keep source paths and manifest values server-validated.

- [ ] **Step 4: Verify real fixture output**

Run: `pnpm --filter @ad-agent/renderer test && pnpm --filter @ad-agent/renderer typecheck`

Expected: PASS; both ratio fixtures have correct dimensions and no renderer error.

- [ ] **Step 5: Commit renderer changes**

```bash
git add apps/renderer/src/ffmpeg-renderer.ts apps/renderer/src/server.ts apps/renderer/test
git commit -m "feat: render approved edits in multiple ratios"
```

### Task 6: Wire API routes and remove fake production fallback

**Files:**
- Modify: `apps/api/src/tasks/routes.ts`
- Modify: `apps/api/src/providers/provider-factory.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/test/integrations.test.ts`
- Test: `apps/api/test/edit-only-flow.test.ts`

- [ ] **Step 1: Write failing route integration tests**

Test upload -> analyze -> plan approval -> preview request -> revision -> final approval; assert target duration and ratio are persisted, no preview occurs before approval, and `FakeAnalysisProvider` is used only when the request explicitly selects demo mode.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --filter @ad-agent/api test -- edit-only-flow.test.ts integrations.test.ts`

Expected: FAIL because routes still call `new FakeAnalysisProvider()` directly and do not persist the new analysis map/plan states.

- [ ] **Step 3: Implement route orchestration**

Inject provider factory dependencies into route creation. Add endpoints for `POST /:taskId/analyze`, `POST /:taskId/plan-approval`, `POST /:taskId/preview`, `POST /:taskId/revisions`, and `POST /:taskId/final-approval`. Validate the persisted task and latest plan on every transition, use idempotency on all mutating calls, and return business-readable failure reasons.

- [ ] **Step 4: Run full API checks**

Run: `pnpm --filter @ad-agent/api test && pnpm --filter @ad-agent/api typecheck`

Expected: PASS; production configuration without a real analysis provider fails with a clear configuration error rather than silently using fake analysis.

- [ ] **Step 5: Commit API integration**

```bash
git add apps/api/src/tasks/routes.ts apps/api/src/providers/provider-factory.ts apps/api/src/env.ts apps/api/test
git commit -m "feat: run approved agent editing workflow through provider factory"
```

### Task 7: Implement workbench states and human review surfaces

**Files:**
- Modify: `apps/web/src/features/tasks/EditOnlyForm.tsx`
- Modify: `apps/web/src/features/tasks/ReviewPage.tsx`
- Modify: `apps/web/src/features/tasks/VersionsPage.tsx`
- Modify: `apps/web/src/features/tasks/TaskListPage.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Tests: `apps/web/src/features/tasks/EditOnlyForm.test.tsx`, `apps/web/e2e/edit-only.spec.ts`

- [ ] **Step 1: Write failing UI tests**

Cover natural-language requirements, user-selected duration and ratio, requirements interpretation, analysis value map, expandable segment evidence, plan timeline with source windows and reasons, review of voice/subtitles/overlay decisions, preview playback, revision diff, and final approval.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --filter @ad-agent/web test -- EditOnlyForm.test.tsx && pnpm --filter @ad-agent/web test:e2e -- edit-only.spec.ts`

Expected: FAIL because the current UI still exposes old operation controls and does not render analysis-map or plan-review states.

- [ ] **Step 3: Implement the smallest complete A-line flow**

Use business language in the UI. Show full analysis status, value categories, confidence and reasons on demand; keep technical prompt/model details hidden. Provide a ratio selector, free-text revision field, clear “确认方案，生成低清预览” action, and final approval/download action. Do not show estimated costs or rights-confirmation checkboxes.

- [ ] **Step 4: Run browser validation**

Run: `pnpm --filter @ad-agent/web test && pnpm --filter @ad-agent/web test:e2e`

Expected: PASS; desktop and 390x844 mobile views have no horizontal overflow, selected segments update detail, preview/revision states are visible, and browser console has no relevant errors.

- [ ] **Step 5: Commit the workbench**

```bash
git add apps/web/src apps/web/e2e
git commit -m "feat: add agent edit plan and review workbench"
```

### Task 8: Add final media checks, version delivery and verification evidence

**Files:**
- Modify: `apps/api/src/tasks/routes.ts`
- Modify: `apps/api/src/tasks/repository.ts`
- Modify: `apps/web/src/features/tasks/VersionsPage.tsx`
- Modify: `docs/architecture/mvp-foundation-verification.md`
- Test: `apps/api/test/final-review.test.ts`, `apps/web/e2e/session-recovery.spec.ts`

- [ ] **Step 1: Write failing final-review tests**

Cover output duration/ratio, black-frame and missing-resource checks, subtitle/audio presence, safe-zone warnings, plan hash matching, version download, task recovery on another browser session, and failure/retry messaging.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --filter @ad-agent/api test -- final-review.test.ts && pnpm --filter @ad-agent/web test:e2e -- session-recovery.spec.ts`

Expected: FAIL because final media checks and the new version metadata are not present.

- [ ] **Step 3: Implement checks and delivery metadata**

Persist actual output dimensions, duration, plan hash, renderer/provider, version number, approval history and actual usage records. Block download until final approval, but allow internal preview download before approval. Map renderer/provider failures to retryable business messages without raw provider responses.

- [ ] **Step 4: Run the complete repository verification**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm test:e2e`

Expected: PASS with no unhandled console errors; report separately what is local, simulated, provider-backed, and still unverified.

- [ ] **Step 5: Update architecture evidence and commit**

Record the exact fixture videos, ratios, provider mode, screenshots, test commands and known gaps in `docs/architecture/mvp-foundation-verification.md`, then commit:

```bash
git add apps/api/src/tasks apps/api/test apps/web/src/features/tasks apps/web/e2e docs/architecture/mvp-foundation-verification.md
git commit -m "feat: verify and deliver approved agent edit versions"
```

## Plan self-review

- Spec coverage: A-line full-video understanding, value map, Agent planning, must-use clips, ratio choice, human confirmation, low-resolution preview, natural-language revision, mixed execution boundary, final review, cross-device recovery, cost truthfulness, and TikTok-oriented risk review are covered by Tasks 1–8.
- Placeholder scan: no `TBD`, `TODO`, or unspecified “add appropriate handling” steps remain; each task names files, tests, commands and expected outcomes.
- Type consistency: `analysis_map.v1` is produced by Task 3 and consumed by Task 4; `edit_plan.v1` is defined in Task 1, persisted in Task 2, planned in Task 4, rendered in Task 5, routed in Task 6 and displayed in Task 7.
- Explicit non-goals: product-image generation/MiniMax image-to-video, real TTS, Jianying automation and TikTok publishing remain outside this plan.
