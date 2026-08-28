# Agent Harness and Skill Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a provider-agnostic Agent Harness boundary so real model-backed Skills can run with resumable task state without changing the canvas contract.

**Architecture:** The API owns a small Harness interface and a deterministic workflow runner. Skills expose typed `run` methods and depend on model/tool Providers. The first implementation wraps the existing analysis path, preserving demo mode while allowing a real multimodal provider to be selected through environment bindings.

**Tech Stack:** TypeScript, Hono, Cloudflare D1/R2 bindings, Vitest, existing `@ad-agent/contracts` and `@ad-agent/workflow` packages.

**Spec:** `docs/superpowers/specs/2026-08-25-indonesia-tiktok-ad-agent-design.md`

## Global Constraints

- Agent decides and explains; execution providers execute confirmed plans.
- Natural language remains the primary operator input.
- Demo/Fake providers must not be presented as real model capability.
- Secrets remain in environment or managed secret storage and are never logged.
- Preserve all existing uncommitted user changes.

---

### Task 1: Define Harness and Skill contracts

**Files:**
- Create: `apps/api/src/agent/harness.ts`
- Create: `apps/api/src/agent/skill.ts`
- Test: `apps/api/test/agent-harness.test.ts`

- [x] Write failing tests for registering a Skill, executing it with a run id, and returning a typed pause-for-approval result.
- [x] Run `pnpm --filter @ad-agent/api test -- agent-harness.test.ts` and verify the missing contract failure.
- [x] Implement minimal `AgentHarness`, `AgentSkill`, `SkillContext`, and `SkillResult` types plus an in-memory runner for tests/local preview.
- [x] Re-run the focused test and then the API test suite.

### Task 2: Wrap media analysis as a Skill

**Files:**
- Create: `apps/api/src/agent/skills/media-analysis-skill.ts`
- Modify: `apps/api/src/tasks/routes.ts`
- Test: `apps/api/test/media-analysis-skill.test.ts`

- [x] Write a failing test proving the Skill selects the configured analysis Provider and returns an analysis map without exposing credentials.
- [x] Run the focused test and confirm failure before implementation.
- [x] Implement the Skill wrapper and route integration while preserving idempotency and existing task status transitions.
- [x] Verify focused tests and existing task API tests.

### Task 3: Add a real multimodal Provider seam

**Files:**
- Modify: `apps/api/src/providers/analysis-adapters.ts`
- Modify: `apps/api/src/providers/provider-factory.ts`
- Test: `apps/api/test/provider-factory.test.ts`

- [x] Add failing tests for configured real Providers and fail-closed behavior.
- [x] Implement the product vision adapter factory seam without hard-coding a vendor URL or API key.
- [x] Run provider and API tests.

### Task 4: Document local and cloud runtime modes

**Files:**
- Create: `docs/architecture/agent-harness-runtime.md`

- [x] Document local preview, cloud API/Harness, queue, object storage, and renderer responsibilities.
- [x] Include the Codex adapter as optional planner, not as the persistence/runtime dependency.
- [x] Record the first real acceptance flow: product image analysis through human approval.

### Task 5: Verification checkpoint

- [x] Run `pnpm typecheck`.
- [x] Run `pnpm build`.
- [x] Run focused API and workflow tests.
- [x] Run `git diff --check` and report any remaining fake-provider boundaries explicitly.
