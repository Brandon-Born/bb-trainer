# Project Blueprint: BB Trainer (Web)

## Product Summary

BB Trainer is a replay analysis web app for Blood Bowl 3.
Input: replay XML.
Output: constructive coaching report with overall advice and turn-level improvements.

## Baseline Decisions

1. Deployment target: Vercel.
2. Application shape: single Next.js TypeScript app.
3. Analysis approach: deterministic rules first, optional AI narration later.
4. Safety: offline replay analysis only, no game hooking.

## Implementation Progress (2026-02-08)

1. M0 scaffold is complete: app bootstrapped with lint/test/build/CI foundations.
2. M1 foundation is in progress: XML upload endpoint, parser, and timeline pipeline are implemented.
3. Remaining M1 work: broaden replay schema coverage with real BB3 samples and tighten rule quality.

## Proposed Folder Structure

```text
.
├─ AGENTS.md
├─ docs/
│  └─ PROJECT_BLUEPRINT.md
├─ src/
│  ├─ app/
│  │  ├─ page.tsx
│  │  ├─ upload/page.tsx
│  │  └─ report/[id]/page.tsx
│  ├─ server/
│  │  ├─ api/replay/route.ts
│  │  └─ services/analyzeReplay.ts
│  ├─ domain/
│  │  ├─ replay/
│  │  │  ├─ types.ts
│  │  │  ├─ parseXml.ts
│  │  │  └─ buildTimeline.ts
│  │  ├─ analysis/
│  │  │  ├─ heuristics.ts
│  │  │  ├─ evaluateTurn.ts
│  │  │  └─ summarizeMatch.ts
│  │  └─ coaching/
│  │     └─ renderAdvice.ts
│  └─ lib/
│     ├─ config.ts
│     ├─ errors.ts
│     └─ logger.ts
├─ tests/
│  ├─ fixtures/replays/
│  ├─ unit/
│  └─ e2e/
└─ package.json
```

## Milestone Plan

## M0: App Bootstrap

Deliverables:
1. Next.js app with TypeScript, Tailwind, ESLint, Prettier.
2. CI pipeline running lint, typecheck, unit tests, and build.
3. First Vercel preview deployment.

Acceptance:
1. `pnpm dev`, `pnpm test`, `pnpm lint`, and `pnpm build` pass.
2. Root page renders and links to upload flow.

## M1: Replay Parsing Foundation

Deliverables:
1. Replay upload endpoint with size/type validation.
2. XML parser that normalizes input into internal replay model.
3. Timeline reconstruction for turns and key actions.

Acceptance:
1. Parser handles valid fixture files and fails cleanly on malformed XML.
2. Replay model has explicit TypeScript types and Zod boundary validation.

## M2: Macro Coaching

Deliverables:
1. Metrics:
   - Turnovers by cause.
   - Reroll spending quality.
   - Block quality/risk profile.
   - Ball progression tempo.
2. Report summary card with 3-5 actionable priorities.

Acceptance:
1. Each recommendation references specific turns/events.
2. Explanations are constructive and specific.

## M3: Turn-by-Turn Advice

Deliverables:
1. Per-turn analysis: chosen line vs safer alternative sequence.
2. Human-readable rationale templates from structured findings.

Acceptance:
1. Every flagged turn includes:
   - What happened.
   - Why it was risky.
   - One concrete alternative.

## M4: Persistence and History (Optional Early)

Deliverables:
1. Save reports and analysis metadata.
2. Show trend view across uploaded matches.

Acceptance:
1. Users can open prior reports by ID.
2. Data model supports future team/faction filters.

## Non-Functional Requirements

1. Reliability: invalid uploads do not crash the server route.
2. Performance: keep processing under serverless limits for typical replay sizes.
3. Explainability: every score/recommendation traces back to explicit rule results.
4. Privacy: only process files required for analysis; no silent third-party transfer.

## Replay Fixtures

1. Sanitized demo replays are available in `demo-replays/` (`demo1.bbr`, `demo2.bbr`, `demo3.bbr`).
2. Agents can inspect these replays to understand real BB3 replay structure and evolve parsing rules.
3. Investigation notes and current code mappings are tracked in `docs/REPLAY_INVESTIGATION.md`.

## Best Practices for Coding Agents

1. Implement core logic as pure functions under `src/domain`.
2. Write or update tests with every heuristic change.
3. Keep rule thresholds centralized (single config/constants module).
4. Avoid mixing parse, evaluation, and presentation concerns.
5. Prefer explicit types over `any`; fail fast on unknown event shapes.
6. Surface user-safe errors (`invalid replay`, `unsupported replay version`, etc.).
7. If introducing AI-generated phrasing, keep raw rule output available for audit.

## Versioning and Change Log Rules

1. Update `AGENTS.md` when stack/architecture decisions change.
2. Update this blueprint when milestones are added/reordered.
3. Add a short dated note for major heuristic changes to preserve analysis history.
