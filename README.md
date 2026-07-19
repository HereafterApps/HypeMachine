# Hype Machine

Infrastructure for creating and operating **disclosed AI personas** ("virtual
creators") that run configurable campaigns across multiple platforms — with a
mandatory human approval gate on every outgoing item.

The core loop, fully wired end-to-end:

```
Persona → Campaign → Generate → Guardrails → Approve → Publish → Measure → Learn → Generate Better
```

## Status

Working today (verified by an end-to-end integration suite against live
Postgres + Redis):

- **Persona & campaign management** — CRUD, assets, platform accounts,
  guardrail configs, schedules; seeded starter templates (Professor Steve /
  GuidedGenius)
- **Content generation** — short-video plans, text posts, replies via
  Anthropic Claude structured outputs (or a deterministic keyless stub for
  dev), persona memory retrieval, plug-frequency pacing, duplicate avoidance
- **Guardrails** — banned claims/topics, competitor rules, platform limits,
  risk scoring, the pre-approval checklist; blockers make content
  unapprovable until edited (edits re-run the checks)
- **Approval workflow** — approve / reject (→ learning memory) / edit /
  regenerate quick-actions; email/Discord/console notifications
- **Publishing** — manual-export bundles working now; adapter slots for
  YouTube/X/TikTok/… with automatic fallback; encrypted platform tokens
- **Scheduling** — BullMQ + Redis: cron/interval content schedules, quiet
  hours, daily caps, approval-backlog limits, scheduled publishing
- **Analytics & learning loop** — metric ingestion (manual entry fallback),
  engagement rates, LLM-generated learning insights that become persona
  memory and shape the next generation
- **Observability** — every job logged with duration and LLM cost

- **Build-spec guardrails (§2)** — political-content policy for
  DEBUNK/CIVIC_MECHANICS (advocacy blocked, primary-source citation
  required, reviewer tests A & B surfaced), cross-persona coordination
  block, mission campaigns locked out of engagement optimization,
  human-picked debunk topics only (§7.1 conservative default)

See [`docs/build-spec.md`](docs/build-spec.md) for the authoritative
product spec, [`docs/product-plan.md`](docs/product-plan.md) for the
detailed reference plan,
[`docs/architecture.md`](docs/architecture.md) for how this implementation
maps to it, and [`docs/setup.md`](docs/setup.md) to get running in ~2 minutes.

## Stack (hybrid, per build-spec §4.1)

React+Vite control panel → TypeScript control plane (Fastify, Prisma,
BullMQ, publishing adapters) → **Python/FastAPI pipeline service**
(prompts, Claude structured outputs, guardrail engine, learning loop).

## Quick start

```bash
pnpm install && (cd apps/pipeline && uv sync) && cp .env.example .env
pnpm dev:infra                     # local Postgres 16 + Redis 7, no Docker
pnpm db:migrate && pnpm db:seed    # schema + Professor Steve / GuidedGenius
pnpm dev:pipeline                  # Python pipeline on :8300
pnpm dev:api                       # API + workers on :3001
pnpm dev:web                       # control panel on :3000
```

Runs fully offline with `LLM_PROVIDER=stub`; set `LLM_PROVIDER=anthropic` +
`ANTHROPIC_API_KEY` for real generation.

```bash
pnpm test                           # TS unit tests
(cd apps/pipeline && uv run pytest) # pipeline service tests
pnpm test:integration               # full demo-scenario e2e against live infra
```

## Scope & ethics baseline (non-negotiable, see build-spec §2)

- Personas are **disclosed** as AI/virtual — a channel, not a disguise.
- **Own-channel engagement only** — no posing as independent users in other
  people's threads, no sockpuppets, no cross-persona coordinated messaging.
- **Human approval is mandatory** for every outgoing item.
- **Political content:** civic mechanics and specific-claim debunks only —
  never advocacy, never candidate/party/election persuasion. Debunks target
  claims, not people, and require a citable primary source.
- WhatsApp is opted-in broadcast/replies only; cold outreach is a permanent
  non-goal.
