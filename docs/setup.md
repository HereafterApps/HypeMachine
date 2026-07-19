# Setup

The stack is hybrid (build-spec §4.1, decided): **TypeScript** control plane
(Fastify API, BullMQ workers, Prisma/Postgres, publishing adapters, React
control panel) + **Python/FastAPI** pipeline service (generation, guardrail
engine, learning insights).

## Prerequisites

- Node.js ≥ 20, pnpm ≥ 9
- Python ≥ 3.11 + [uv](https://docs.astral.sh/uv/)
- PostgreSQL 16 and Redis 7 — either your own, or the bundled no-Docker dev
  infra (`scripts/dev-infra.sh`), or Docker equivalents

## Quick start

```bash
pnpm install
(cd apps/pipeline && uv sync)
cp .env.example .env

# 1. Local Postgres + Redis (no Docker needed; state in .dev-infra/)
pnpm dev:infra

# 2. Database schema + starter templates (Professor Steve / GuidedGenius)
pnpm db:migrate      # prisma migrate dev
pnpm db:seed

# 3. Run the three services (separate terminals)
pnpm dev:pipeline    # Python pipeline on :8300 (LLM_PROVIDER=stub → keyless)
pnpm dev:api         # API + workers on :3001, auth: Bearer $API_TOKEN
pnpm dev:web         # control panel on http://localhost:3000
```

Open http://localhost:3000 — Settings → set the API token (default
`change-me`), then use Personas / Campaigns / Approval Queue.

Smoke test:

```bash
curl localhost:3001/health
curl -H "Authorization: Bearer change-me" localhost:3001/personas
```

Trigger the whole loop by hand (with `LLM_PROVIDER=stub` this needs no API keys):

```bash
CAMPAIGN_ID=$(curl -s -H "Authorization: Bearer change-me" localhost:3001/campaigns | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].id')

# Generate → approval queue
curl -s -X POST -H "Authorization: Bearer change-me" -H "content-type: application/json" \
  -d "{\"campaignId\": \"$CAMPAIGN_ID\"}" localhost:3001/generation/run

# Review and approve (publishes via manual export to ./storage/exports/…)
curl -s -H "Authorization: Bearer change-me" localhost:3001/approvals
curl -s -X POST -H "Authorization: Bearer change-me" localhost:3001/approvals/<contentId>/approve
```

## Tests

```bash
pnpm test                          # TS unit tests (all packages)
(cd apps/pipeline && uv run pytest) # pipeline service tests
pnpm dev:infra                     # once, for the integration suite
pnpm db:migrate && pnpm db:seed
pnpm test:integration              # full demo-scenario e2e against live PG + Redis
                                   # (boots the Python pipeline itself)
pnpm typecheck
```

## Environment variables

See `.env.example` for the full list. The important ones:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis for BullMQ queues |
| `API_TOKEN` | Single-user bearer token (v1 auth) |
| `PIPELINE_URL` / `PIPELINE_TOKEN` | Where the API reaches the Python pipeline + shared bearer token |
| `LLM_PROVIDER` | Read by the pipeline: `stub` (deterministic, keyless) or `anthropic` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Read by the pipeline for real generation (default model `claude-opus-4-8`) |
| `STORAGE_DRIVER` | `local` (default, `./storage`) or `s3` (`pnpm add @aws-sdk/client-s3 --filter @hype/storage`) |
| `NOTIFY_CHANNELS` | Comma-separated: `console`, `discord`, `email` |
| `DISCORD_WEBHOOK_URL` | Approval notifications via Discord |
| `SES_REGION`, `NOTIFY_EMAIL_FROM/TO` | Approval notifications via SES email (`pnpm add @aws-sdk/client-ses --filter @hype/notifications`) |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for platform tokens at rest |

## Switching to real generation

```bash
# root .env (the pipeline reads it on startup; restart pnpm dev:pipeline)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-…
```

Everything else is identical — the provider sits behind the pipeline's
`LlmProvider` protocol and produces the same validated, guardrail-checked
output shapes.
