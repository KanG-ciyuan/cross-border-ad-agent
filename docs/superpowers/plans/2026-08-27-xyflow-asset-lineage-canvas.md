# XYFlow Asset-Lineage Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AdFlow's hand-written product-generation demo canvas with a mature desktop XYFlow editor backed by a versioned, typed asset-lineage graph.

**Architecture:** `@ad-agent/contracts` owns the serializable `canvas_graph.v1` boundary and graph validation. The web app adapts that contract to XYFlow nodes/edges, keeps workflow semantics in pure functions, renders domain-specific nodes and an inspector, and persists the graph plus viewport locally until D1/R2 persistence is added.

**Tech Stack:** React 19, TypeScript, Zod 4, Vitest, Testing Library, `@xyflow/react`, Vite.

**Spec:** `docs/superpowers/specs/2026-08-25-indonesia-tiktok-ad-agent-design.md`

## Global Constraints

- Preserve all existing uncommitted changes in `feat/mvp-foundation`.
- Connections are typed structured-data dependencies, never decorative lines.
- Demo/Fake behavior remains explicitly labeled and cannot imply real model execution.
- Desktop canvas only; mobile canvas behavior is out of scope.
- Do not read, expose, move, replace, or commit API keys.
- Do not deploy or commit without separate user authorization.

---

### Task 1: Define `canvas_graph.v1`

**Files:**
- Create: `packages/contracts/src/canvas-graph.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Produces: `CanvasGraphV1`, `CanvasNodeV1`, `CanvasEdgeV1`, `CanvasNodeType`, `CanvasDataType`, `validateCanvasGraph`.

- [ ] **Step 1: Write failing contract tests** for a valid graph, an incompatible port edge, an unknown endpoint, and a cycle.
- [ ] **Step 2: Run `pnpm --filter @ad-agent/contracts test`** and confirm failure because the canvas contract is absent.
- [ ] **Step 3: Implement strict Zod schemas** for graph revision/viewport, typed ports, asset references, node version/status/lock/`derivedFrom`, and edges.
- [ ] **Step 4: Implement graph validation** that rejects endpoint, port, data-type, self-edge, duplicate-edge, and cycle violations with business-readable issues.
- [ ] **Step 5: Re-run contracts tests and typecheck** and confirm green.

### Task 2: Add Pure Canvas Workflow Semantics

**Files:**
- Create: `apps/web/src/features/workbenches/product-canvas/canvas-graph.ts`
- Create: `apps/web/src/features/workbenches/product-canvas/canvas-graph.test.ts`
- Create: `apps/web/src/features/workbenches/product-canvas/canvas-seed.ts`

**Interfaces:**
- Consumes: `CanvasGraphV1` contract.
- Produces: `connectCanvasNodes`, `updateCanvasNodeVersion`, `serializeCanvasGraph`, `restoreCanvasGraph`, and `seedCanvasGraph`.

- [ ] **Step 1: Write failing tests** showing compatible connections succeed, invalid connections return a reason, upstream version changes mark all reachable descendants `stale`, locked upstream data remains locked, and serialization restores the graph and viewport.
- [ ] **Step 2: Run the focused web tests** and verify the missing module failure.
- [ ] **Step 3: Implement the minimal immutable graph functions** using the contract validator and a breadth-first descendant walk.
- [ ] **Step 4: Re-run focused tests** and confirm green.

### Task 3: Replace the Canvas UI with XYFlow

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/features/workbenches/product-canvas/AdFlowCanvasNode.tsx`
- Create: `apps/web/src/features/workbenches/product-canvas/CanvasInspector.tsx`
- Rewrite: `apps/web/src/features/workbenches/ProductGenerationCanvas.tsx`
- Modify: `apps/web/src/features/workbenches/WorkbenchPages.test.tsx`
- Modify: `apps/web/src/styles/app.css`

**Interfaces:**
- Consumes: `seedCanvasGraph` and pure graph operations.
- Produces: a desktop XYFlow editor with typed Handles, real edges, Controls, MiniMap, Background, selection, deletion, reconnection, local upload, and inspector state.

- [ ] **Step 1: Add failing component tests** for domain nodes, inspector selection, upload, visible demo boundary, restore/reset controls, and invalid-connection feedback.
- [ ] **Step 2: Install official `@xyflow/react`** and verify package source/license metadata before use.
- [ ] **Step 3: Implement memoized custom nodes** outside the parent render, with stable dimensions, typed input/output Handles, status, version, lock state, and media previews.
- [ ] **Step 4: Implement XYFlow graph interaction** with controlled nodes/edges, connect, reconnect, delete, multi-select, pan/zoom, fit view, Controls, MiniMap, and Background.
- [ ] **Step 5: Implement local persistence** under a versioned project key and provide an explicit reset-to-demo action.
- [ ] **Step 6: Implement the inspector** for node purpose, structured inputs/outputs, lineage, stale/confirmation state, and clearly labeled demo actions.
- [ ] **Step 7: Replace fixed-line CSS** with workbench styles that preserve the accepted AdFlow visual language and remain readable at a desktop viewport.
- [ ] **Step 8: Run web tests, typecheck, and build** and confirm green.

### Task 4: Desktop Browser Acceptance

**Files:**
- Modify only files needed to fix acceptance failures found in Task 3.

**Interfaces:**
- Produces: browser evidence for the actual route `/workbench/canvas?demo=1`.

- [ ] **Step 1: Start the local Vite server** on an available port.
- [ ] **Step 2: Verify in a desktop browser** pan, wheel zoom, Controls, MiniMap, node drag with following edge, connect, invalid connection reason, edge selection/delete/reconnect, multi-select, image upload, inspector changes, and reload restoration.
- [ ] **Step 3: Inspect the console** and fix runtime errors or significant warnings.
- [ ] **Step 4: Capture a desktop screenshot** and review hierarchy, legibility, overlap, clipping, node stability, and demo labeling.
- [ ] **Step 5: Run full relevant tests, typechecks, build, and `git diff --check`** before reporting completion.

### Deferred Backend Milestone

D1 graph persistence, R2 media persistence, multi-user conflict handling, real image/video model calls, Agent execution, and generation receipts are deliberately excluded from this UI milestone. The contract and local serialization must remain compatible with adding those capabilities without redesigning the editor.
