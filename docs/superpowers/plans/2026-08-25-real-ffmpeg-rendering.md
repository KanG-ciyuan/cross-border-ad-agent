# Real FFmpeg Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn uploaded videos in an `edit_only` task into a real TikTok-ready MP4 that can be downloaded from the task version page.

**Architecture:** Keep the Cloudflare Worker responsible for authentication, workflow state, D1, and R2. Add a replaceable local renderer HTTP service that receives the approved edit plan plus the task's uploaded video bytes, invokes FFmpeg in an isolated temporary directory, and returns an MP4. The Worker stores the output in R2 and records the real output asset on a new immutable version.

**Tech Stack:** TypeScript, Node.js 22 HTTP server, FFmpeg/FFprobe, Hono Cloudflare Worker, D1, R2, React, Vitest.

---

## Scope

- Real rendering is enabled for `edit_only` tasks with at least one uploaded MP4 or QuickTime video.
- Output is H.264/AAC MP4, 1080x1920, 30 fps, with source audio when present, short crossfades, a top product label derived from the task title, Indonesian caption overlays derived from the edit instructions, and a closing CTA.
- Source clips are trimmed to safe ranges after FFprobe inspection. Invalid, missing, or undecodable videos fail with a stable error code and remain retryable.
- Image-to-video, MiniMax paid generation, voiceover generation, music selection, and Jianying automation stay outside this implementation.

## File Structure

- `apps/renderer/src/server.ts`: authenticated-local render endpoint, multipart parsing, temporary workspace lifecycle, and response handling.
- `apps/renderer/src/ffmpeg-renderer.ts`: FFprobe inspection and deterministic FFmpeg command construction/execution.
- `apps/renderer/test/ffmpeg-renderer.test.ts`: command and validation behavior.
- `apps/api/src/providers/http-renderer.ts`: Worker-side renderer client and secret-safe error mapping.
- `apps/api/src/tasks/routes.ts`: gather approved video assets, call renderer, persist output to R2/D1.
- `apps/api/src/uploads/routes.ts`: authenticated output asset streaming.
- `apps/api/src/env.ts` and `apps/api/wrangler.jsonc`: renderer base URL binding.
- `apps/web/src/api/client.ts` and `apps/web/src/features/tasks/VersionsPage.tsx`: output asset URL and download control.
- `apps/web/src/app/router.tsx`: make the global versions entry resolve real data rather than a fixed demo task.

### Task 1: Renderer Core

- [ ] Write failing tests for safe clip normalization, supported MIME types, and FFmpeg argument construction.
- [ ] Run the renderer tests and confirm they fail because the renderer module is absent.
- [ ] Implement FFprobe-based input inspection and FFmpeg rendering with stable error codes.
- [ ] Run renderer tests and typecheck.
- [ ] Commit the renderer core.

### Task 2: Worker Integration and Output Persistence

- [ ] Write failing API tests showing that render sends uploaded video bytes to the renderer, stores returned MP4 in R2, saves a derived asset, and records its ID on the new version.
- [ ] Run the focused API tests and confirm the fake renderer behavior fails the new assertions.
- [ ] Implement `HttpRenderProvider`, renderer configuration, R2 persistence, and authenticated output streaming.
- [ ] Run API tests and typecheck.
- [ ] Commit the Worker integration.

### Task 3: Version Page Download and Navigation

- [ ] Write failing web tests for a real download link and for an empty real versions landing page.
- [ ] Run the focused web tests and confirm the missing controls/navigation behavior.
- [ ] Add the output asset ID to the client contract, render preview/download actions, and remove the fixed real-mode demo redirect.
- [ ] Run web tests and typecheck.
- [ ] Commit the web workflow.

### Task 4: End-to-End Real Render Verification

- [ ] Start the API, web app, and renderer service together.
- [ ] Generate two short synthetic source clips with FFmpeg and upload them through the real UI flow.
- [ ] Complete analysis and start rendering without invoking MiniMax.
- [ ] Verify the output is an actual MP4 with 1080x1920 dimensions, H.264 video, AAC audio, and a downloadable version entry.
- [ ] Run the full test, typecheck, and build commands.
- [ ] Update the verification boundary and commit the evidence.
