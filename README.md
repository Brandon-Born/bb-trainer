# BB Trainer

Web app for Blood Bowl 3 replay coaching. Users upload replay XML and receive:

1. Macro feedback on patterns and risk.
2. Turn-by-turn constructive advice.

This project is built for Vercel deployment with Next.js App Router.

## Current Status

The repository now contains a working project scaffold:

1. Next.js + TypeScript + Tailwind setup.
2. Replay upload UI and `/api/replay` analysis endpoint.
3. Initial domain modules for parsing, timeline building, heuristic analysis, and coaching text.
4. Unit and e2e test scaffolding.
5. CI workflow for lint, typecheck, unit tests, and build.

Analysis logic is intentionally simple in this first pass and designed to be replaced with richer Blood Bowl-specific heuristics.

## Demo Replay

1. Sanitized demo replays: `demo-replays/demo1.bbr`, `demo-replays/demo2.bbr`, `demo-replays/demo3.bbr`.
2. These replays are intended for parser/analysis development and agent inspection.
3. Sensitive values have been anonymized (names, gamer/account IDs, lobby/match IDs, IP addresses).

## Tech Stack

1. Next.js (App Router)
2. TypeScript
3. Tailwind CSS
4. Zod
5. fast-xml-parser
6. Vitest + Playwright
7. Vercel deployment target

## Project Structure

```text
src/
  app/
    api/replay/route.ts
    upload/page.tsx
    report/[id]/page.tsx
    page.tsx
    layout.tsx
  domain/
    replay/
    analysis/
    coaching/
  server/
    services/analyzeReplay.ts
  lib/
tests/
  unit/
  e2e/
docs/
  PROJECT_BLUEPRINT.md
AGENTS.md
```

## Local Development

Prerequisites:

1. Node.js 20+
2. pnpm 9+

Commands:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Optional e2e:

```bash
pnpm test:e2e
```

## Vercel Deployment

1. Push repository to GitHub.
2. Import project in Vercel.
3. Framework preset: Next.js (auto-detected).
4. Build command: `pnpm build` (default is fine).
5. Output: managed by Next.js.
6. Runtime: Node.js for replay analysis endpoint.

No required environment variables yet.

## Agent Build Guidelines

1. Keep parsing, analysis, and coaching generation under `src/domain/*`.
2. Keep route handlers thin and orchestration-focused.
3. Validate input at boundaries and handle malformed XML safely.
4. Add fixture-based tests for new parser/heuristic behavior.
5. Maintain explainable recommendations tied to replay evidence.

See:

1. `AGENTS.md` for operating rules.
2. `docs/PROJECT_BLUEPRINT.md` for milestones and acceptance criteria.
