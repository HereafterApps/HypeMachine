# Architecture

Implementation companion to [`product-plan.md`](product-plan.md). The core
loop (§28) is fully wired:

```
Persona → Campaign → Generate → Guardrails → Approve → Publish → Measure → Learn → Generate Better
```

## Hybrid stack (build-spec §4.1, decided)

The **Python pipeline service** (`apps/pipeline`, FastAPI) is the single
source of truth for the LLM-facing stages — `plan → generate →
guardrail-check` and the learning loop. The **TypeScript control plane**
(`apps/api`) owns everything stateful: DB, approval workflow, publishing
adapters, scheduling, notifications. They talk over HTTP with a shared
bearer token (`PIPELINE_URL` / `PIPELINE_TOKEN`).

```
apps/web (React+Vite)  →  apps/api (Fastify/Prisma/BullMQ)  →  apps/pipeline (FastAPI)
                             │                                    │
                          Postgres/Redis                    Anthropic Claude / stub
```

## Monorepo layout

| Workspace | What it does |
|---|---|
| `apps/web` | React + Vite + TS control panel — the four §5 screens: persona list/create, campaign create (optimize-for locked for Debunk), approval queue, campaign dashboard |
| `apps/api` | Fastify API, services (orchestration), BullMQ jobs, single-user bearer auth |
| `apps/pipeline` | Python/FastAPI: prompt builders, Anthropic Claude structured outputs + deterministic stub provider, guardrail engine (§2 checks incl. political policy), learning-insight generation. `uv` project with pytest suite |
| `packages/core` | Shared enums, zod content schemas (reference), guardrail/analytics types, utilities |
| `packages/db` | Prisma schema (+ `JobLog`), client singleton, idempotent seed (Professor Steve + GuidedGenius) |
| `packages/storage` | S3-compatible adapter with local-disk driver for dev; S3 driver loads the AWS SDK lazily |
| `packages/publishing` | `PublishingProvider` interface, working `ManualExportProvider`, typed M3/M5 slots for YouTube/X/TikTok/… with automatic manual-export fallback |
| `packages/notifications` | `Notifier` interface: Discord webhook, SES email (lazy dep), console fallback, fan-out composite |

## Request/served flow

- **Routes** are thin: zod-validate → call a service. Errors map to
  400 (validation), 404 (missing), 409 (domain-rule conflicts), 500.
- **GenerationService**: loads persona+campaign+guardrails+sources,
  retrieves memory (importance + recency + keyword score), pulls recent
  content for duplicate avoidance, paces the product plug toward the
  campaign's target ratio, then calls the **pipeline service**, which builds
  the prompts, calls the LLM with a strict schema, runs the guardrail
  engine, and returns content + checklist in one response. The service
  saves `GeneratedContent` (+ `VideoAsset` storyboard for videos), opens an
  `Approval`, notifies the approval channel.
- **ApprovalService** (§7.5, §11): approve/reject/edit/regenerate.
  Nothing publishes without approval; content with guardrail *blockers*
  cannot be approved until edited (edits re-run guardrails). Rejections
  write `FAILED_HOOK` memories. Quick actions (make funnier/shorter/…)
  archive the draft and regenerate with an instruction.
- **PublishingService** (§7.6): resolves the platform provider, falls back
  to manual export when no API account is connected, records
  `PublishedPost`, notifies success/failure. Platform tokens are stored
  AES-256-GCM-encrypted.
- **AnalyticsService** (§7.8, §12): provider metrics where available,
  manual metric entry otherwise; the learning loop compares posts, asks the
  LLM for one actionable insight, stores it as `LearningInsight` **and** as
  `CAMPAIGN_LEARNING` persona memory — future prompts include it (§12.4).

## Job system (§18)

BullMQ over Redis; every job logs to `JobLog` with duration + cost.

- `hype-scheduler` tick (every minute): due `ContentSchedule` rows
  (cron via cron-parser or interval) → enqueue generation, honoring
  campaign/persona status, quiet hours, max-daily counts, and an approval
  backlog limit; due `SCHEDULED` content → enqueue publishing (idempotent
  job ids).
- `hype-generate`, `hype-publish`: call the services above.
- `hype-analytics` (every 6h): ingest metrics, regenerate insights.

## Provider abstraction

Every external capability sits behind an interface with a working default
and typed slots for later phases:

| Capability | Working now | Slots reserved |
|---|---|---|
| LLM | Anthropic (structured outputs) + deterministic stub | any vendor behind `LlmProvider` |
| Publishing | Manual export bundles | YouTube, X, TikTok, Instagram, LinkedIn, Facebook, Threads, WhatsApp |
| Video (avatar/voice/render) | Storyboard capture (`VideoAsset.STORYBOARD`) | HeyGen, ElevenLabs, Shotstack (§16.2–16.4, Phase 4) |
| Storage | Local disk | S3 |
| Notifications | Console, Discord webhook | SES email (lazy dep) |

## Guardrails (build-spec §2) — enforced in code, not just docs

1. **Disclosure** — mandatory on personas, injected into every system prompt
   ("never pretend to be a real human").
2. **Mandatory human approval** — a hard status gate: `PENDING_APPROVAL →
   APPROVED` transitions happen only through the approval endpoints; no
   auto-publish path exists.
3. **Own-channel only** — no forum-style content type exists; replies are
   generated only for the persona's own posts/DMs.
4. **No sockpuppet coordination** — campaign creation and generation both
   reject an ACTIVE campaign on the same subject under a *different*
   persona (409 with explanation).
5. **WhatsApp opted-in only** — reply/broadcast content type behind the same
   approval gate; no bulk-outreach surface.
6. **Political content policy** — for DEBUNK / CIVIC_MECHANICS /
   MEDIA_LITERACY campaigns the guardrail engine blocks advocacy phrasing
   (test A floor: vote-for/against, elect/defeat, support-the-candidate…),
   DEBUNK content is unapprovable without ≥1 primary-source citation, and
   every political item carries a standing reviewer warning to apply tests
   A & B ("targets a claim, not a person; correction is verifiable").
   Type-specific rules are also injected into the generation prompt.
7. **Learning-loop constraint** — mission campaign types are locked to
   CLARITY/COMPLETION optimization targets (REACH/ENGAGEMENT rejected with
   409); the insight-generation prompt explicitly forbids recommending
   engagement maximization for them, and snapshots carry a `missionMetric`.

**§7.1 conservative default:** DEBUNK campaigns cannot have automated
schedules and every generation requires a human-supplied `claimToDebunk` —
i.e. option (a), human picks every topic — until the open decision on topic
selection is resolved.
