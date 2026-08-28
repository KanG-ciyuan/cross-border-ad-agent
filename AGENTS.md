# AdFlow Agent Instructions

This repository is an in-progress Indonesia TikTok advertising workbench. Read `HANDOFF.md` and the formal design specification before changing code.

## Product invariants

- Preserve two independent pipelines: existing-material intelligent editing and product-image-to-video generation.
- Natural language is the primary operator input. Duration and aspect ratio are task-specific constraints, not fixed system defaults.
- The Agent owns understanding, creative planning, clip selection, reasons, scripts, storyboards and prompt compilation. FFmpeg, Remotion, Jianying and video models execute confirmed plans.
- Never substitute fixed alternating clips, fixed 30/45-second output, rule-only stitching, static cards or a Fake Provider for real Agent behavior.
- The product canvas is a typed asset-lineage graph. Preserve node versions, `derivedFrom`, confirmation/lock state, stale propagation and real data transfer between nodes.
- AI outputs are candidates. Product facts, assets, edit plans, storyboards, previews and final videos require explicit human confirmation at their defined boundaries.
- Preserve product identity and confirmed facts. Do not promote inferred side/back packaging or unreadable labels into facts.
- Do not promise universal watermark removal or guaranteed TikTok approval.

## Current implementation boundary

- Cloudflare Worker/D1 is the current API runtime, but the approved next target is a Windows-hosted Node API with SQLite and local file storage.
- Keep providers and storage portable. Do not hard-code a relay, model vendor, Agent framework, file path or desktop executor into business contracts.
- `/workbench/canvas` is the primary B-line entry. Uploading the first product image should create/reuse a draft task and drive the same persisted graph. `/tasks/new` may remain a shortcut, not a second workflow.
- UI success and deterministic tests do not prove live ASR/OCR, image generation, MiniMax, TTS, Jianying or publishing.

## Security

- You may use API Keys required for authorized testing, but never display or log their complete values.
- Never write real Keys, passwords, salts, hashes, Session Pepper, cookies or tokens into code, docs, fixtures, `.env.example` or Git.
- Never commit `.env`, `.dev.vars`, authentication files, databases, uploaded media or generated media.
- When auditing credentials, report only the variable name, file location and risk.
- Do not move, delete, replace or revoke an existing credential without explicit user approval.
- Inspect the source, permissions, install behavior and network behavior of an unknown plugin or script before installation, and obtain user approval.

## Engineering workflow

- The worktree may contain user-owned changes. Inspect and preserve them; do not reset, clean or revert unrelated work.
- Start with read-only baseline checks. Keep implementation scoped to the approved milestone.
- Prefer versioned contracts and replaceable adapters over vendor-specific logic in routes or UI.
- Add tests proportional to the changed contract and run focused tests before the full suite.
- Before claiming completion, run `pnpm typecheck`, `pnpm test`, `pnpm build` and `git diff --check`, plus browser or Windows runtime verification when relevant.
- Report capabilities as `verified`, `historical`, `to verify` or `not implemented`. Never turn a demo into a production claim.

## Windows migration milestone

Follow `docs/deployment/windows-node-migration.md`. The first acceptance target is login, canvas product-image upload, automatic draft creation, real visual analysis, fact-candidate display, human confirmation and persistence across refresh on the Windows host.
