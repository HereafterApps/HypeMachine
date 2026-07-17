# HypeMachine - Technical Guidelines

Stack (hybrid, decided per build-spec 4.1 / 7.3):

- Frontend: React + Vite + TypeScript (`apps/web`) - persona list/create,
  campaign create, approval queue, campaign dashboard.
- Control plane: TypeScript + Fastify (`apps/api`) - Postgres/Prisma state,
  approval workflow, publishing adapters, BullMQ scheduling, notifications,
  AES-256-GCM token encryption. Single-user bearer auth in v1.
- AI pipeline: Python 3.11 + FastAPI (`apps/pipeline`, uv-managed) - the
  single source of truth for prompts, Claude structured-outputs generation
  (stub provider for keyless dev), the guardrail engine, and learning
  insights. Called by the API over HTTP with a shared bearer token.
- DB: PostgreSQL 16 (Prisma migrations). Queue: Redis 7 + BullMQ.
- Shared TS packages: `core` (enums/types), `db`, `storage` (local/S3),
  `publishing` (adapter pattern; MANUAL_EXPORT works today, YouTube/X/etc.
  are slots), `notifications` (Discord webhook, SES, console).

Local dev: `scripts/dev-infra.sh` (no Docker) or `docker-compose.yml`.
Setup and commands: `docs/setup.md`. Architecture detail:
`docs/architecture.md`.

Testing: vitest unit suites per package, pytest for the pipeline, and an
end-to-end suite (`apps/api/test/e2e.test.ts`) that boots the pipeline and
runs the full loop against live Postgres/Redis.
