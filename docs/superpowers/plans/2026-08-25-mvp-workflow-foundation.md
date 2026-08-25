# Indonesia TikTok Ad Agent MVP Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable first-stage application with invite-only login, cross-device task persistence, complete-creation and edit-only workflows, `edit_plan.v1`, human approval gates, cost limits, and simulated media providers.

**Architecture:** Use a pnpm TypeScript workspace with a React/Vite browser client, a Hono Cloudflare Worker API, D1 persistence, R2 media storage, and shared Zod contracts. Keep workflow rules in a pure package and call generation/rendering through provider interfaces; the first plan uses deterministic fake providers so the full business flow can be tested before paying for Seedance or cloud rendering.

**Tech Stack:** Node.js 22, pnpm, TypeScript, React, Vite, React Router, Hono, Cloudflare Workers/D1/R2, Zod, Vitest, Cloudflare Vitest pool, Playwright, Lucide React, CSS modules/tokens.

---

## Delivery Boundary

This plan produces working, testable software, but does not perform real video analysis, Seedance generation, FFmpeg/Remotion rendering, Jianying automation, TikTok publishing, or production deployment. Those are separate plans after this foundation passes acceptance.

Planned follow-up sequence:

1. FFmpeg/Remotion container proof of concept with one real kitchen-cleaner material pack.
2. Seedance 2.5 and company TTS provider adapters.
3. Cloudflare production deployment, observability, quotas, retention, and recovery.
4. Optional Jianying draft/export execution adapter.

## File Map

```text
apps/
  api/
    src/index.ts                 # Hono routes and Worker entry
    src/env.ts                   # Cloudflare binding types
    src/auth/                    # Password, session, and origin checks
    src/tasks/                   # Task HTTP handlers and D1 repository
    src/uploads/                 # R2 upload validation and object metadata
    src/providers/               # Deterministic fake analysis/render providers
    test/                        # Worker integration tests
    wrangler.jsonc               # Local and Cloudflare bindings
  web/
    src/app/                     # Router, session boundary, application shell
    src/features/auth/           # Login UI
    src/features/tasks/          # List, create, confirmation, review, versions
    src/components/              # Shared controls and status UI
    src/styles/                  # Tokens and responsive workbench styles
    e2e/                         # Browser acceptance tests
packages/
  contracts/src/                 # Zod API, task, asset, and edit-plan contracts
  workflow/src/                  # Pure state machine, gates, retry, and cost rules
migrations/                      # D1 schema
scripts/create-user.mjs          # Invite-only authorized-user creation
docs/architecture/               # Runtime, security, and evidence boundaries
```

### Task 1: Initialize the TypeScript workspace and quality gates

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `vitest.workspace.ts`
- Create: `apps/web/package.json`
- Create: `apps/api/package.json`
- Create: `packages/contracts/package.json`
- Create: `packages/workflow/package.json`

- [ ] **Step 1: Obtain explicit approval for repository initialization and dependency installation**

State that execution will run `git init` and install the reviewed npm packages listed in this plan. Do not initialize Git or contact the package registry until the user approves those two actions.

- [ ] **Step 2: Review dependency source and license metadata**

Inspect official npm metadata and upstream repositories for React, Vite, React Router, Hono, Zod, Vitest, `@cloudflare/vitest-pool-workers`, Playwright, Lucide React, and Wrangler. Record package name, upstream URL, license, install scripts, and network behavior in `docs/architecture/dependency-review.md`. Stop for approval if an unexpected install script or non-permissive license appears.

- [ ] **Step 3: Write the workspace manifest**

```json
{
  "name": "cross-border-ad-agent",
  "private": true,
  "packageManager": "pnpm@10",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --parallel --filter ./apps/* dev",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run",
    "test:e2e": "pnpm --filter @ad-agent/web test:e2e",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 4: Protect generated files and secrets**

```gitignore
node_modules/
dist/
.wrangler/
playwright-report/
test-results/
.env
.env.*
!.env.example
*.pem
*.key
.DS_Store
.superpowers/
```

`.env.example` may contain variable names only. It must never contain a real password, API key, session secret, account ID, database ID, or bucket credential.

- [ ] **Step 5: Install the approved dependencies and verify the empty workspace**

Run: `pnpm install && pnpm typecheck && pnpm test`

Expected: dependency install succeeds; typecheck and test commands exit `0` with no test failures.

- [ ] **Step 6: Commit the workspace foundation**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore vitest.workspace.ts apps packages docs/architecture/dependency-review.md
git commit -m "chore: initialize ad agent workspace"
```

### Task 2: Define versioned task and editing contracts

**Files:**
- Create: `packages/contracts/src/task.ts`
- Create: `packages/contracts/src/edit-plan.ts`
- Create: `packages/contracts/src/api.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/contracts.test.ts`

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { EditPlanV1, TaskCreateInput } from "./index";

describe("TaskCreateInput", () => {
  it("accepts an edit-only task without product-generation options", () => {
    expect(TaskCreateInput.parse({
      goal: "edit_only",
      market: "ID",
      platform: "tiktok",
      allowedOperations: ["trim", "concat", "captions"]
    }).goal).toBe("edit_only");
  });

  it("rejects generation options in edit-only mode", () => {
    expect(() => TaskCreateInput.parse({
      goal: "edit_only",
      market: "ID",
      platform: "tiktok",
      allowedOperations: ["trim"],
      referenceGeneration: ["three_view"]
    })).toThrow();
  });
});

describe("EditPlanV1", () => {
  it("rejects arbitrary executables and absolute source paths", () => {
    expect(() => EditPlanV1.parse({
      version: "edit_plan.v1",
      taskId: "tsk_12345678",
      output: { width: 1080, height: 1920, fps: 30, language: "id-ID" },
      tracks: [{ id: "v1", type: "video", clips: [{
        id: "c1", assetId: "ast_12345678", sourcePath: "/tmp/run.sh",
        startMs: 0, endMs: 1000
      }]}]
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm vitest run packages/contracts/src/contracts.test.ts`

Expected: FAIL because `TaskCreateInput` and `EditPlanV1` do not exist.

- [ ] **Step 3: Implement the schemas**

Define literal version `edit_plan.v1`; task goals `complete_creation | edit_only`; input modes `video | product_images | mixed`; allowed operations `trim | concat | captions | voiceover | stickers | transitions | music`; reference generation `three_view | nine_grid`; asset IDs instead of filesystem paths; millisecond time ranges; origin metadata; approval IDs; cost estimates in integer Chinese fen; and renderer receipts. Add a `superRefine` rule that forbids reference or AI-video generation fields when `goal === "edit_only"`.

- [ ] **Step 4: Run contract tests**

Run: `pnpm vitest run packages/contracts/src/contracts.test.ts`

Expected: PASS with all invalid edit-only and unsafe-path cases rejected.

- [ ] **Step 5: Commit contracts**

```bash
git add packages/contracts
git commit -m "feat: define task and edit plan contracts"
```

### Task 3: Implement the workflow state machine, gates, retries, and cost policy

**Files:**
- Create: `packages/workflow/src/state-machine.ts`
- Create: `packages/workflow/src/policy.ts`
- Create: `packages/workflow/src/index.ts`
- Test: `packages/workflow/src/workflow.test.ts`

- [ ] **Step 1: Write failing workflow tests**

```ts
import { describe, expect, it } from "vitest";
import { transition, canRunGeneration, nextAttempt } from "./index";

it("requires reference approval before generation", () => {
  expect(canRunGeneration({ goal: "complete_creation", referenceApproved: false })).toBe(false);
});

it("never permits generation for edit-only tasks", () => {
  expect(canRunGeneration({ goal: "edit_only", referenceApproved: true })).toBe(false);
});

it("stops retrying after two automatic attempts", () => {
  expect(nextAttempt({ attempts: 2, maxAutomaticAttempts: 2 })).toEqual({ action: "pause_for_human" });
});

it("does not skip final approval", () => {
  expect(() => transition("pending_content_review", "approve_final")).toThrow();
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm vitest run packages/workflow/src/workflow.test.ts`

Expected: FAIL because workflow functions do not exist.

- [ ] **Step 3: Implement explicit transitions and policies**

Use the states `draft`, `uploaded`, `analyzing`, `needs_material`, `awaiting_generation_approval`, `ready_to_render`, `rendering`, `pending_content_review`, `pending_final_approval`, `approved`, `failed_retryable`, and `cancelled`. Return structured denial reasons such as `REFERENCE_APPROVAL_REQUIRED`, `EDIT_ONLY_GENERATION_FORBIDDEN`, and `COST_LIMIT_EXCEEDED`.

- [ ] **Step 4: Run workflow tests**

Run: `pnpm vitest run packages/workflow/src/workflow.test.ts`

Expected: PASS, including retry and approval-gate cases.

- [ ] **Step 5: Commit workflow rules**

```bash
git add packages/workflow
git commit -m "feat: add guarded task workflow"
```

### Task 4: Create D1 schema and repositories

**Files:**
- Create: `migrations/0001_initial.sql`
- Create: `apps/api/src/env.ts`
- Create: `apps/api/src/tasks/repository.ts`
- Create: `apps/api/src/auth/repository.ts`
- Test: `apps/api/test/repositories.test.ts`

- [ ] **Step 1: Write repository integration tests**

Cover authorized users, sessions, tasks, assets, approvals, step attempts, idempotency keys, cost entries, and versions. Assert that deleting a task is not exposed by the repository in MVP and that one idempotency key cannot create two generation attempts.

- [ ] **Step 2: Run the Worker tests and confirm failure**

Run: `pnpm --filter @ad-agent/api test -- repositories.test.ts`

Expected: FAIL because the migration and repositories are missing.

- [ ] **Step 3: Create the initial schema**

Create tables `users`, `sessions`, `tasks`, `assets`, `approvals`, `step_attempts`, `idempotency_keys`, `cost_entries`, and `task_versions`. Use opaque text IDs, integer timestamps, integer fen for money, foreign keys, and unique constraints for email and idempotency keys. Store password hashes and session-token hashes only, never raw values.

- [ ] **Step 4: Implement repositories with parameterized D1 statements**

Expose narrow methods such as `createTask`, `getTaskForUser`, `listTasksForUser`, `saveApproval`, `reserveIdempotencyKey`, and `appendCostEntry`. Every task query must include the authenticated user or company scope.

- [ ] **Step 5: Run repository tests**

Run: `pnpm --filter @ad-agent/api test -- repositories.test.ts`

Expected: PASS against an isolated D1 test database.

- [ ] **Step 6: Commit persistence**

```bash
git add migrations apps/api/src/env.ts apps/api/src/tasks apps/api/src/auth apps/api/test/repositories.test.ts
git commit -m "feat: persist users and ad tasks in d1"
```

### Task 5: Add invite-only password authentication

**Files:**
- Create: `apps/api/src/auth/password.ts`
- Create: `apps/api/src/auth/session.ts`
- Create: `apps/api/src/auth/routes.ts`
- Create: `scripts/create-user.mjs`
- Test: `apps/api/test/auth.test.ts`

- [ ] **Step 1: Write failing authentication tests**

Test successful login for an authorized user, generic failure for unknown email and wrong password, no public registration route, session expiry, `HttpOnly; Secure; SameSite=Lax` cookie attributes in production, hashed session tokens in D1, and rejected cross-origin mutations.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @ad-agent/api test -- auth.test.ts`

Expected: FAIL because authentication routes do not exist.

- [ ] **Step 3: Implement password and session primitives**

Use Web Crypto PBKDF2-HMAC-SHA-256 with a random per-user salt, a server-side pepper binding, an iteration count stored with the hash for future upgrades, constant-time byte comparison, 32-byte random session tokens, and only a SHA-256 token hash in D1. Never log passwords, cookies, raw tokens, salts with password input, or the pepper.

- [ ] **Step 4: Implement invite-only routes**

Expose `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`. Do not expose registration, password reset, or user-list endpoints in MVP. Require same-origin checks for login/logout and all authenticated mutation routes.

- [ ] **Step 5: Implement the local authorized-user command**

`scripts/create-user.mjs` must accept `--email`, request the password through a hidden terminal prompt, write only the derived hash record, and never print the password or hash. Refuse passwords passed as command-line arguments because process lists and shell history can expose them.

- [ ] **Step 6: Run authentication tests**

Run: `pnpm --filter @ad-agent/api test -- auth.test.ts`

Expected: PASS with no raw credential values in captured logs.

- [ ] **Step 7: Commit authentication**

```bash
git add apps/api/src/auth apps/api/test/auth.test.ts scripts/create-user.mjs
git commit -m "feat: add invite-only authentication"
```

### Task 6: Add task, approval, idempotency, and upload APIs

**Files:**
- Create: `apps/api/src/tasks/routes.ts`
- Create: `apps/api/src/uploads/routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/test/tasks-api.test.ts`
- Test: `apps/api/test/uploads-api.test.ts`

- [ ] **Step 1: Write failing API tests**

Cover task creation for both goals, rejection of generation fields in edit-only mode, list/detail ownership, reference approval, storyboard approval, content review, final approval, cost-limit conflicts, duplicate idempotency keys, accepted media types, filename normalization, and a 25 MB per-file raw streaming-upload MVP limit. Larger files require a later direct-to-R2 upload flow.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @ad-agent/api test -- tasks-api.test.ts uploads-api.test.ts`

Expected: FAIL because routes are missing.

- [ ] **Step 3: Implement task routes**

Expose:

```text
POST   /api/tasks
GET    /api/tasks
GET    /api/tasks/:taskId
PATCH  /api/tasks/:taskId/draft
POST   /api/tasks/:taskId/analyze
POST   /api/tasks/:taskId/approvals
POST   /api/tasks/:taskId/render
POST   /api/tasks/:taskId/review
GET    /api/tasks/:taskId/versions
```

Validate every body with shared contracts. Require `Idempotency-Key` for analyze, generation, render, and review mutations.

- [ ] **Step 4: Implement bounded R2 uploads**

Expose `POST /api/tasks/:taskId/assets` for streaming files to R2 in the first-stage limit. Validate declared MIME type, inspect media signatures where supported, generate opaque object keys, store the original filename only as escaped metadata, and return asset IDs rather than bucket paths.

- [ ] **Step 5: Run API tests**

Run: `pnpm --filter @ad-agent/api test -- tasks-api.test.ts uploads-api.test.ts`

Expected: PASS with ownership, idempotency, type, and size failures returning structured error codes.

- [ ] **Step 6: Commit APIs**

```bash
git add apps/api/src/index.ts apps/api/src/tasks/routes.ts apps/api/src/uploads apps/api/test
git commit -m "feat: expose guarded task and upload APIs"
```

### Task 7: Implement deterministic fake Agent and renderer adapters

**Files:**
- Create: `apps/api/src/providers/types.ts`
- Create: `apps/api/src/providers/fake-analysis.ts`
- Create: `apps/api/src/providers/fake-renderer.ts`
- Test: `apps/api/test/providers.test.ts`

- [ ] **Step 1: Write failing provider-contract tests**

Assert that the fake analysis provider always returns the same Indonesian kitchen-cleaner script and nine-shot plan for the same fixture, that generated reference provenance is stored outside image bytes, that edit-only plans contain no generated assets, and that fake rendering returns a receipt tied to the exact `edit_plan.v1` hash.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @ad-agent/api test -- providers.test.ts`

Expected: FAIL because provider adapters do not exist.

- [ ] **Step 3: Define replaceable provider interfaces**

```ts
export interface AnalysisProvider {
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}

export interface RenderProvider {
  render(plan: EditPlanV1): Promise<RenderReceipt>;
}
```

Do not import Hono, D1, R2, Seedance, FFmpeg, Remotion, or Codex-specific APIs into the interface definitions.

- [ ] **Step 4: Implement deterministic fixtures**

Return stable three-view metadata, nine-grid storyboard data, Indonesian script, cost estimate in fen, and a simulated review video poster. For edit-only tasks, transform only uploaded asset IDs and allowed operations into `edit_plan.v1`.

- [ ] **Step 5: Run provider tests**

Run: `pnpm --filter @ad-agent/api test -- providers.test.ts`

Expected: PASS and identical fixture input produces byte-equivalent JSON output.

- [ ] **Step 6: Commit provider boundary**

```bash
git add apps/api/src/providers apps/api/test/providers.test.ts
git commit -m "feat: add replaceable workflow providers"
```

### Task 8: Build the authenticated application shell and task list

**Files:**
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/AppShell.tsx`
- Create: `apps/web/src/features/auth/LoginPage.tsx`
- Create: `apps/web/src/features/tasks/TaskListPage.tsx`
- Create: `apps/web/src/components/StatusBadge.tsx`
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/app.css`
- Test: `apps/web/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Test login validation, unauthenticated redirects, task status in business language, RMB formatting through `Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" })`, product-main-image thumbnails, empty state, loading state, server failure with retry, and task-row navigation.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @ad-agent/web test -- TaskListPage.test.tsx`

Expected: FAIL because pages and components are missing.

- [ ] **Step 3: Implement the workbench shell**

Preserve the approved prototype hierarchy: stable left navigation on desktop, compact top navigation on mobile, concise page title, attention metrics, comparison table, and one primary action. Use Lucide icons with accessible names and visible keyboard focus. Do not expose provider names or model parameters.

- [ ] **Step 4: Implement complete states**

Add skeleton loading, empty task guidance, retriable server error, expired-session redirect, and preserved return location. Toasts may acknowledge success but must not be the only representation of an actionable error.

- [ ] **Step 5: Run UI tests**

Run: `pnpm --filter @ad-agent/web test -- TaskListPage.test.tsx`

Expected: PASS for authentication, RMB, thumbnails, navigation, and failure recovery.

- [ ] **Step 6: Commit shell and task list**

```bash
git add apps/web/src
git commit -m "feat: add authenticated task workbench"
```

### Task 9: Build complete-creation and edit-only task forms

**Files:**
- Create: `apps/web/src/features/tasks/CreateTaskPage.tsx`
- Create: `apps/web/src/features/tasks/CompleteCreationForm.tsx`
- Create: `apps/web/src/features/tasks/EditOnlyForm.tsx`
- Create: `apps/web/src/features/tasks/AssetUploader.tsx`
- Test: `apps/web/src/features/tasks/CreateTaskPage.test.tsx`

- [ ] **Step 1: Write failing form tests**

Assert that selecting edit-only hides product facts and reference-generation choices; displays only asset upload, edit instructions, and allowed operations; and submits no generation fields. Assert that complete creation exposes `three_view` and `nine_grid` choices after product-main-image upload.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @ad-agent/web test -- CreateTaskPage.test.tsx`

Expected: FAIL because task forms do not exist.

- [ ] **Step 3: Implement goal-first progressive disclosure**

The first control must ask “这次要完成什么” with `完整广告创作` and `只剪现有素材`. Preserve entered values when switching goals during the same unsaved draft, but strip forbidden fields from the submitted edit-only payload.

- [ ] **Step 4: Implement upload and validation states**

Show per-file pending, uploading, success, invalid type, too large, and retry states. After a main product image succeeds, show `生成三视图` and `生成九宫格分镜` checkboxes. Explain that results appear in confirmation and no source text is burned into image pixels.

- [ ] **Step 5: Run form tests**

Run: `pnpm --filter @ad-agent/web test -- CreateTaskPage.test.tsx`

Expected: PASS for both goals, validation, progressive disclosure, and payload stripping.

- [ ] **Step 6: Commit task creation**

```bash
git add apps/web/src/features/tasks
git commit -m "feat: add guarded ad task creation"
```

### Task 10: Build confirmation, review, and version workflows

**Files:**
- Create: `apps/web/src/features/tasks/ConfirmationPage.tsx`
- Create: `apps/web/src/features/tasks/ReviewPage.tsx`
- Create: `apps/web/src/features/tasks/VersionsPage.tsx`
- Create: `apps/web/src/features/tasks/ReferenceGallery.tsx`
- Create: `apps/web/src/features/tasks/StoryboardGrid.tsx`
- Test: `apps/web/src/features/tasks/ApprovalFlow.test.tsx`

- [ ] **Step 1: Write failing approval-flow tests**

Test that source badges render outside reference-image containers, source text is absent from image alt text and asset URLs, generation is blocked until reference/storyboard/cost/risk confirmations are checked, one shot can be retried without replacing successful shots, and content approval cannot skip final approval.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @ad-agent/web test -- ApprovalFlow.test.tsx`

Expected: FAIL because approval pages are missing.

- [ ] **Step 3: Implement confirmation UI**

Render original upload and generated candidates as separate gallery items. Put `原始上传` or `生成候选` in metadata below each image, never as image pixels or overlays. Display nine-grid shots, Indonesian script, RMB estimate, cost cap, and explicit checkboxes before generation.

- [ ] **Step 4: Implement review and versions UI**

Provide video/poster area, timeline tracks, shot-level status, `重新生成此镜头`, `改用稳定方案`, subtitle editing, content-review decision, final approval, version comparison, cost ledger, and audit history. In fake-provider mode, label output as simulated.

- [ ] **Step 5: Run approval tests**

Run: `pnpm --filter @ad-agent/web test -- ApprovalFlow.test.tsx`

Expected: PASS with source metadata outside images and both approval gates enforced.

- [ ] **Step 6: Commit approval workflow**

```bash
git add apps/web/src/features/tasks
git commit -m "feat: add human approval and review workflow"
```

### Task 11: Add end-to-end acceptance tests and responsive evidence

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/complete-creation.spec.ts`
- Create: `apps/web/e2e/edit-only.spec.ts`
- Create: `apps/web/e2e/session-recovery.spec.ts`
- Create: `docs/architecture/mvp-foundation-verification.md`

- [ ] **Step 1: Write the complete-creation browser test**

Login, create an Indonesian TikTok product-image task, upload fixture images, request three-view and nine-grid outputs, approve references/storyboard/cost/risk, render with the fake provider, review one shot, approve content, approve final output, and verify a version with RMB cost exists.

- [ ] **Step 2: Write the edit-only browser test**

Login, select edit-only, upload fixture videos, allow only trim/concat/captions, submit, and assert through the task API response that no generated reference, AI-video, new-claim, or extra-copy fields exist.

- [ ] **Step 3: Write cross-device/session recovery coverage**

Create a task in one browser context, close it, open a fresh authenticated context, and verify the same persisted task state, approvals, versions, and costs are visible.

- [ ] **Step 4: Run desktop and mobile tests**

Run: `pnpm test:e2e`

Expected: PASS at desktop `1440 × 900` and mobile `390 × 844`, with no horizontal page overflow, clipped controls, inaccessible required fields, or console errors.

- [ ] **Step 5: Run the complete quality gate**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`

Expected: all commands exit `0`.

- [ ] **Step 6: Record evidence boundaries**

In `mvp-foundation-verification.md`, list verified local behavior, simulated providers, unverified Cloudflare deployment, unverified real rendering, and unverified Seedance/TTS integration. Include test commands and screenshot paths; do not claim production readiness.

- [ ] **Step 7: Commit acceptance coverage**

```bash
git add apps/web/e2e apps/web/playwright.config.ts docs/architecture/mvp-foundation-verification.md
git commit -m "test: cover mvp workflow acceptance"
```

### Task 12: Prepare Cloudflare preview configuration without production deployment

**Files:**
- Create: `apps/api/wrangler.jsonc`
- Create: `apps/web/vite.config.ts`
- Create: `.env.example`
- Create: `docs/architecture/cloudflare-preview-runbook.md`
- Test: `apps/api/test/bindings.test.ts`

- [ ] **Step 1: Write a failing binding test**

Assert that the Worker refuses to start without `DB`, `MEDIA`, `SESSION_PEPPER`, and an explicit environment name, and that test/local/preview bindings cannot accidentally point at a production D1 database or R2 bucket.

- [ ] **Step 2: Run the binding test and confirm failure**

Run: `pnpm --filter @ad-agent/api test -- bindings.test.ts`

Expected: FAIL because binding validation is missing.

- [ ] **Step 3: Add local and preview configuration**

Define local D1 and R2 bindings, compatibility date, asset routing, migration directory, and secrets by variable name only. Keep production IDs absent. `.env.example` contains only:

```dotenv
APP_ENV=
SESSION_PEPPER=
```

- [ ] **Step 4: Write the preview runbook**

Document local startup, D1 migration, hidden-password user creation, test execution, preview resource creation, secret entry through Wrangler, rollback, and cleanup. Mark every command that creates Cloudflare resources or deploys a preview as requiring user approval immediately before execution.

- [ ] **Step 5: Run local preview checks without deploying**

Run: `pnpm --filter @ad-agent/api dev` and `pnpm --filter @ad-agent/web dev`

Expected: local login, task creation, confirmation, fake render, review, and version flow work through the browser.

- [ ] **Step 6: Run final quality gate**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`

Expected: all commands exit `0`; no real API keys or account identifiers appear in tracked files or logs.

- [ ] **Step 7: Commit preview configuration**

```bash
git add apps/api/wrangler.jsonc apps/web/vite.config.ts .env.example docs/architecture/cloudflare-preview-runbook.md apps/api/test/bindings.test.ts
git commit -m "chore: prepare cloudflare preview configuration"
```

## Foundation Acceptance

This implementation plan is complete only when:

- invite-only login works with no public registration;
- task data survives a new browser context;
- RMB is used everywhere in the operator UI;
- product thumbnails use uploaded main images;
- complete-creation and edit-only payloads remain structurally separate;
- edit-only tasks cannot reach any generation provider;
- three-view and nine-grid choices appear after product-image upload;
- generated-source metadata appears outside images only;
- approval, retry, cost, idempotency, and final-review gates pass automated tests;
- desktop and mobile primary flows pass;
- fake-provider output is clearly labeled simulated;
- tracked files and logs contain no real credentials;
- real rendering, Seedance, TTS, Jianying, publishing, and production deployment remain explicitly unverified.
