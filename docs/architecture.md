# Architecture

Implementation companion to [`product-plan.md`](product-plan.md). The core
loop (§28) is fully wired:

```
Persona → Campaign → Generate → Guardrails → Approve → Publish → Measure → Learn → Generate Better
```

## Monorepo layout

| Workspace | What it does |
|---|---|
| `packages/core` | Shared enums (§5), zod schemas for structured LLM output (§8), guardrail/analytics types, utilities |
| `packages/db` | Prisma schema (every model in §5 + `JobLog` for §24/§25), client singleton, idempotent seed (Professor Steve + GuidedGenius, §13–§14) |
| `packages/ai` | `LlmProvider` interface (§16.1), `AnthropicLlmProvider` (Claude structured outputs), `StubLlmProvider` (deterministic, keyless), prompt builders (§8.1–8.3) |
| `packages/guardrails` | Deterministic policy engine (§7.9): banned claims/topics, competitor rules, platform limits, plug-directness, duplicate detection; produces the approval checklist (§19) |
| `packages/storage` | S3-compatible adapter with local-disk driver for dev (§3.1); S3 driver loads the AWS SDK lazily |
| `packages/publishing` | `PublishingProvider` interface (§16.5), working `ManualExportProvider`, typed Phase-5 slots for YouTube/X/TikTok/… with automatic manual-export fallback |
| `packages/notifications` | `Notifier` interface: Discord webhook, SES email (lazy dep), console fallback, fan-out composite |
| `apps/api` | Fastify API (§17), services (§7), BullMQ jobs (§18), single-user bearer auth (§3.1) |

## Request/served flow

- **Routes (§17)** are thin: zod-validate → call a service. Errors map to
  400 (validation), 404 (missing), 409 (domain-rule conflicts), 500.
- **GenerationService** (§7.3): loads persona+campaign+guardrails+sources,
  retrieves memory (importance + recency + keyword score), pulls recent
  content for duplicate avoidance, paces the product plug toward the
  campaign's target ratio, calls the LLM with a schema, runs guardrails,
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

## Ethics invariants (§0.1) — enforced in code, not just docs

- Disclosure text is mandatory on personas and injected into every system
  prompt ("never pretend to be a real human").
- No forum-style content type exists; replies are generated only for the
  persona's own posts/DMs.
- Human approval is a hard status gate: `PENDING_APPROVAL → APPROVED`
  transitions happen only through the approval endpoints.
- WhatsApp is a reply/broadcast content type behind the same approval gate;
  there is no bulk-outreach surface.
