# BB Trainer Agent Guide

This file is the canonical operating guide for coding agents working in this repository.

## 1) Project Goal

Build a web application that lets a Blood Bowl 3 player upload a replay XML file and receive:

1. A macro coaching summary (strengths, weaknesses, repeated errors).
2. Constructive turn-by-turn advice with safer or higher-value alternatives.

The app must be deployable on Vercel.

## 2) Current State (as of 2026-02-08)

1. Base Next.js + TypeScript + Tailwind app scaffold is implemented.
2. Upload route (`/upload`) and replay API endpoint (`/api/replay`) are implemented.
3. Initial replay parser, timeline builder, heuristic analyzer, and coaching renderer are implemented.
4. Fixture-based unit tests and CI workflow are present.
5. Current analysis logic is a starter ruleset and requires BB3-specific heuristic expansion.

## 3) Required Tech Stack (Vercel-Oriented)

Use the following unless explicitly changed by the user:

1. Framework: Next.js (App Router) + TypeScript.
2. Runtime: Node.js 20+.
3. UI: React + Tailwind CSS.
4. Validation: Zod.
5. XML parsing: fast-xml-parser.
6. State/data access: server-centric; avoid heavy client state libraries unless needed.
7. Testing: Vitest (unit) + Playwright (e2e smoke).
8. Lint/format: ESLint + Prettier.
9. Package manager: pnpm.

## 4) High-Level Architecture

1. `apps/web` (or root Next app): UI routes, upload flow, report rendering.
2. `src/domain/replay`: replay schema types, XML normalization, event timeline builder.
3. `src/domain/analysis`: rule-based evaluator, heuristic scoring, misplay detection.
4. `src/domain/coaching`: narrative generator from structured findings.
5. `src/server`: API route handlers and orchestration.
6. `src/lib`: shared helpers, logging, config, error utilities.

### Request Flow

1. User uploads replay XML.
2. Server validates + parses XML into normalized model.
3. Analysis engine computes metrics and findings.
4. Coaching layer produces actionable summary + turn notes.
5. UI displays report and optional export/share.

## 5) Delivery Plan

1. Phase 0: Bootstrap project, CI, lint/test/build, Vercel preview deploy.
2. Phase 1: XML upload + parsing + normalized replay model.
3. Phase 2: Macro report (reroll efficiency, turnover causes, positional risk).
4. Phase 3: Turn-by-turn suggestions with constructive language templates.
5. Phase 4: Persistence, historical trends, and report comparison.
6. Phase 5: Optional AI augmentation for wording, while keeping rule outputs auditable.

## 6) Build and Run Standards for Agents

1. Keep domain logic pure and framework-agnostic under `src/domain/*`.
2. Never put analysis logic directly inside React components or route handlers.
3. Validate all external input at boundaries (upload, query params, API body).
4. Treat replay XML as untrusted input; guard against malformed/oversized files.
5. Add fixture-based tests for parser and analyzer before expanding features.
6. Prefer deterministic scoring rules first; document every heuristic.
7. Keep serverless constraints in mind: avoid long synchronous work in request path.
8. Return typed, structured analysis payloads; render language from structured data.
9. Add instrumentation for parse failures and rule misses.
10. Keep PRs small and vertically slice features (parse -> analysis -> UI).

## 7) Local Developer Workflow

After bootstrap, expected commands are:

1. `pnpm install`
2. `pnpm dev`
3. `pnpm test`
4. `pnpm lint`
5. `pnpm build`

Agents should run lint + tests + build before declaring work complete.

## 8) Vercel Deployment Guidance

1. Use default Next.js build settings on Vercel.
2. Keep parsing/analysis in Node runtime routes (not Edge) unless proven lightweight.
3. Use environment variables for feature flags and external integrations.
4. If persistence is added:
   - Use Vercel Postgres or Neon for relational data.
   - Use Vercel Blob for replay/report artifacts if needed.
5. Ensure preview deployments remain functional with seed fixtures.

## 9) Definition of Done (per feature)

1. Type-safe implementation with clear domain boundaries.
2. Unit tests for rule logic and parser edge cases.
3. UI state coverage for success, invalid XML, and analysis errors.
4. No lint/type/build failures.
5. Docs updated if architecture or heuristics changed.

## 10) Out of Scope (initially)

1. Live process hooking or runtime control of BB3.
2. Multiplayer automation or bot play in active online matches.
3. Black-box opaque model scoring without explainable findings.

## 11) Demo Replay Artifact

1. Sanitized real-world demo replays are available in `demo-replays/` (`demo1.bbr`, `demo2.bbr`, `demo3.bbr`).
2. These files are approved for agent inspection to improve parser and analysis coverage.
3. Sensitive identifiers (names, gamer/account IDs, lobby/match IDs, and IP addresses) have been anonymized.
