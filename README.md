# Hype Machine

Persona-first AI content creation and publishing platform. Create long-lived,
**disclosed** virtual personas, run configurable campaigns through them,
generate content (text + video plans), approve everything by hand, publish to
connected platforms, and learn from performance.

See [`docs/product-plan.md`](docs/product-plan.md) for the full product plan
and [`PLANNING.md`](PLANNING.md) for the original scoping notes. The scope &
ethics baseline in the plan (§0.1) is binding: disclosed personas only,
own-channel engagement only, mandatory human approval, no covert identities,
no cold outreach.

## Monorepo layout

```
apps/
  api/            Fastify API (personas, campaigns, generation, approvals)
  web/            Next.js dashboard
packages/
  core/           Shared enums, types, Zod schemas
  db/             Prisma schema + client
  ai/             LLM provider abstraction (Anthropic first) + prompt builders
  guardrails/     Campaign guardrail checks + risk scoring
```

## Getting started

```bash
pnpm install
cp .env.example .env          # fill in ANTHROPIC_API_KEY etc.
docker compose up -d          # postgres + redis
pnpm db:generate
pnpm db:migrate
pnpm dev:api                  # http://localhost:4000
pnpm dev:web                  # http://localhost:3000
```

All API routes (except `/health`) require `Authorization: Bearer $API_TOKEN`.

## Status

Phase 1–2 (foundation + content generation) per the build plan:
persona/campaign CRUD, content generation via the Anthropic adapter,
guardrail checks, approval workflow endpoints, dashboard shell.
Video pipeline, publishing providers, and analytics are interface-stubbed.
