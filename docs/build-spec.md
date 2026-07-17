# HypeMachine — Product Plan & Build Spec
**Audience:** Fable (builder) · **Status:** Planning-complete, build-ready except flagged open decisions · **Author handoff from:** Raahil

> This spec supersedes conflicting parts of `product-plan.md`. Where the two
> disagree (campaign types, political policy, learning-loop constraints,
> stack recommendation), this document wins.

---

## 0. WHAT / WHY (read this first)

**One line:** HypeMachine is a control panel for building disclosed AI personas ("AI creators") and running human-approved marketing campaigns through them across social platforms, with results feeding back to improve future content.

**What it IS:**
- A **factory for reusable AI personas.** You build a persona once (name, face, voice, personality, disclosure). It grows an audience and persists across many campaigns.
- A **campaign runner.** You point a persona at a mission (goal + target + platforms). The system generates content, a human approves it, it publishes, it measures results, it learns.
- **Operator-facing.** The user is the person running the personas, not the audience.

**What it is NOT:**
- **Not TrustLayer.** TrustLayer is a *shield* — a consumer screenshots a suspicious message and gets warned. HypeMachine is a *megaphone* — an operator produces disclosed persuasion to grow attention. Opposite direction, opposite user. If a feature seems to fit both, it belongs in neither.
- **Not a sockpuppet farm.** No fleets of fake "real people," no covert engagement, no astroturfing. Personas are openly AI. This is the hard line that separates a legal AI-creator tool from a bannable influence operation.

**WHY it exists:** Running a consistent, engaging multi-platform presence is slow and expensive; one person can't post daily across five platforms. HypeMachine lets a single operator run several persistent, disclosed creators cheaply. Because personas are reusable, you build audience *once* instead of renting attention repeatedly. **Persona = durable asset. Campaign = disposable mission.**

---

## 1. CORE MODEL (the two nouns + the loop)

- **Persona** — durable. Outlives any campaign. Owns: identity, voice, disclosure text, platform accounts, audience, history, learned preferences.
- **Campaign** — disposable. A mission with a goal, a subject, target platforms, a content plan, and a lifespan. Attaches to one persona.

**The loop (this is the whole product):**
```
Persona → Campaign → Generate → Approve (human) → Publish → Measure → Learn → (back to Generate)
```
Nothing publishes without passing through human approval. This is non-negotiable (see §2).

---

## 2. GUARDRAILS (non-negotiable — enforce in code, not just docs)

1. **Disclosure.** Every persona is labeled as AI: bio disclosure text + platform-native synthetic-media labels on every post. No persona ever claims to be a real human.
2. **Mandatory human approval.** No content reaches a live platform without an explicit human approve action in the queue. No auto-publish path exists, even for "safe" content.
3. **Own-channel engagement only.** Personas post to and reply on *their own* channels. They do **not** post into third-party communities (Reddit, Hacker News, forums, other people's threads). *(This resolves the forum-content inconsistency in the old docs — forum content is OUT.)*
4. **No sockpuppet coordination.** A single operator may run multiple personas, but the system must not enable many personas pushing one coordinated message to simulate organic consensus. Disclosure per-account does not disclose coordination.
5. **WhatsApp = opted-in only.** WhatsApp is limited to broadcasts to subscribers who explicitly opted in. No cold outreach, ever.
6. **Political content policy** (decided):
   - HypeMachine may only do **rungs 1–2**: civic mechanics ("how ranked-choice voting works") and **debunking specific claims** ("this clip is edited, here's the raw footage").
   - **No advocacy** (rung 3–4): never issue advocacy, never candidate/party/election persuasion.
   - **Enforceable test A:** content must end at *"is this specific claim accurate?"*. The moment it answers *"…therefore support / oppose / vote / which side is right,"* it is advocacy → block.
   - **Enforceable test B:** could someone who dislikes the conclusion still agree the *correction itself* is factually accurate? If the "correction" is a contestable opinion dressed as fact → block.
   - **Target claims, not people.** Every debunk is about a statement, never a person's character or a party. Requires a citable primary source.
7. **Learning-loop constraint.** For debunk/media-literacy campaign types, the learning loop must NOT optimize for raw engagement/reach (that pulls toward outrage — the disease, not the cure). It optimizes for a mission-appropriate metric (e.g. completion/clarity). Optimization target is per-campaign-type config, not global.

---

## 3. PLATFORMS

| Platform | Role | In MVP? | Auto-postable? |
|---|---|---|---|
| YouTube (Shorts) | Publish | ✅ MVP | Yes (API) |
| X | Publish | ✅ MVP | Yes (API) |
| Instagram | Publish | Manual export first | No (ban risk) |
| TikTok | Publish | Manual export first | No (ban risk) |
| LinkedIn | Publish | Manual export first | Partial |
| Facebook / Threads | Publish | Later | Partial |
| WhatsApp | Broadcast | Later | Opted-in only |
| Discord | **Internal approval notifications** | ✅ MVP | n/a |
| MANUAL_EXPORT | Fallback "channel" — hands finished content to operator to post | ✅ MVP | n/a |

**Honest reality:** "Supported" ≠ "auto-posted." YouTube + X have workable APIs → they're the MVP. Instagram/TikTok are hostile to automated posting and ban accounts for it → they route through **manual export** (system generates, human posts by hand). Architecture must be **adapter-based** so new platforms drop in without touching core.

Content also splits by modality — a debunk is authored differently as a 30s Short vs an X thread. Generation must be platform-format-aware.

---

## 4. HOW TO BUILD IT

### 4.1 Stack — ⚠️ CONFIRM BEFORE BUILD
The old doc assumed a Node/Next.js/Fastify/Prisma monorepo. Recommended instead, to match Raahil's actual tooling:
- **Frontend:** React + Vite + TypeScript
- **Backend / AI pipeline:** Python + FastAPI (strongest LLM ecosystem + Raahil's comfort)
- **DB:** Postgres (SQLAlchemy or Prisma-py)
- **Job queue:** for generation + scheduled publishing (e.g. RQ/Celery)
- **Notifications:** Discord webhook first, email (SES) second

**Honest flag:** Unlike Raahil's other projects, HypeMachine **cannot be backend-free.** It needs persistent OAuth tokens, scheduled posts, and cross-platform state. localStorage-only is not viable here. This is a real-infrastructure project — plan hosting accordingly.

### 4.2 Architecture
- **Adapter pattern for platforms.** Core never knows platform specifics. Each platform = one adapter implementing `publish()`, `fetchMetrics()`, `format()`. `MANUAL_EXPORT` is a valid adapter that returns the payload for a human.
- **Pipeline stages:** `plan → generate → guardrail-check → queue → approve → publish → measure → learn`. Guardrail-check runs the §2 rules programmatically *before* anything reaches the queue.

### 4.3 Data model (entities + key fields)
```
Persona
  id, name, avatar, voiceProfile, personality,
  disclosureText, defaultPlatformTone, platformAccounts[],
  learnedPreferences, createdAt

Campaign
  id, personaId, goal, subject, type (see enum),
  targetPlatforms[], contentPlan, optimizationTarget,
  status, startAt, endAt

PlatformAccount
  id, personaId, platform (enum), authToken, handle, status

ContentItem (draft)
  id, campaignId, platform, format, body, mediaRefs,
  guardrailStatus, riskLevel, sourceCitations[]

ApprovalItem
  id, contentItemId, state (PENDING/APPROVED/REJECTED/EDIT),
  reviewerNote, decidedAt

Publication
  id, contentItemId, platform, platformPostId, platformUrl,
  publishedAt

Metric
  id, publicationId, platform, views, engagement,
  missionMetric, capturedAt

Enums:
  Platform: YOUTUBE, TIKTOK, INSTAGRAM, FACEBOOK, X, THREADS,
            LINKEDIN, WHATSAPP, DISCORD, MANUAL_EXPORT
  CampaignType: PRODUCT_HYPE, EDUCATION, DEBUNK, CIVIC_MECHANICS
  MessageType: DM_REPLY, WHATSAPP_MESSAGE (opted-in broadcast only)
```

### 4.4 File structure (indicative)
```
apps/
  web/            # React + Vite + TS control panel
  api/            # FastAPI backend
    pipeline/     # plan, generate, guardrails, learn
    adapters/     # youtube/ x/ instagram/ tiktok/ ... manual_export/
    notify/       # discord/ email/
packages/
  shared-types/
```

---

## 5. SCREENS + WIREFRAMES

**Screen 1 — Persona list / create**
```
+------------------------------------------+
| Personas                        [+ New]  |
+------------------------------------------+
| 🤖 Professor Steve  · 12.4k · 2 active   |
| 🤖 GadgetGwen       · 3.1k  · 1 active   |
+------------------------------------------+
 New → name, avatar, personality, VOICE,
       DISCLOSURE TEXT (required), platforms
```

**Screen 2 — Campaign create**
```
+------------------------------------------+
| New Campaign  ·  Persona: Professor Steve|
+------------------------------------------+
| Goal:    [ get people hyped on X app  ]  |
| Type:    (•)Product ( )Education         |
|          ( )Debunk  ( )Civic             |
| Platforms:[x]YouTube [x]X [ ]IG(export)  |
| Optimize for: [ reach ▾ ]                |
|            (locked to 'clarity' if Debunk)|
|                          [ Create ]      |
+------------------------------------------+
```

**Screen 3 — Approval queue (the core screen)**
```
+------------------------------------------+
| Approval Queue                    (4)    |
+------------------------------------------+
| ▸ X · thread · risk:LOW · ✅ guardrails  |
|   "3 things nobody tells you about..."   |
|   [Approve] [Edit] [Reject]              |
+------------------------------------------+
| ▸ YouTube Short · risk:MED · ⚠ cite req  |
|   [Approve] [Edit] [Reject]              |
+------------------------------------------+
| ▸ IG · MANUAL EXPORT · [Copy payload]    |
+------------------------------------------+
 Nothing here publishes until Approved.
```

**Screen 4 — Campaign dashboard**
```
+------------------------------------------+
| GuidedGenius Launch · Professor Steve    |
+------------------------------------------+
| Top platform: YouTube Shorts             |
| Published: 14 · Pending: 4               |
| [reach ▔▔▔▁▁ ] [mission-metric ▔▔▔▔▁]    |
| Learn: "shorter hooks +22% completion"   |
+------------------------------------------+
```

---

## 6. BUILD ORDER (milestones)

1. **M1 — Skeleton + data model.** Persona + Campaign CRUD, Postgres, no publishing.
2. **M2 — Generation + guardrails + approval queue.** Content generates, §2 checks run, human approves. Publishing = MANUAL_EXPORT only.
3. **M3 — First real adapters.** YouTube Shorts + X auto-publish. Discord approval notifications.
4. **M4 — Metrics + learning loop.** Pull metrics, feed persona learnedPreferences, per-type optimization target.
5. **M5 — Expand adapters.** IG/TikTok/LinkedIn (export→partial), WhatsApp opted-in broadcast.

---

## 7. OPEN DECISIONS (not yet settled — do NOT assume)

1. **Debunk topic-selection method.** With advocacy banned, *how a claim gets chosen to debunk* is the entire editorial/bias surface. Not decided. Options on the table: (a) human picks every topic, (b) auto-detect trending claims + human approves topic, (c) audience-submitted only. **Must be resolved before any DEBUNK campaign ships.**
2. **Even-handedness enforcement.** Whether/how to audit that debunk-target selection isn't lopsided over a campaign.
3. **Stack confirmation** (§4.1) — React+Vite+TS + Python/FastAPI vs old Node plan.
4. **Persona-per-fork vs shared-core monorepo** — old open question; current spec assumes shared core.

---

## 8. VALIDATION CHECKLIST (WHAT/WHY/HOW is clear when all true)

- [ ] A new operator can create a disclosed persona and see disclosure enforced on every post.
- [ ] A campaign cannot publish anything without a human Approve.
- [ ] Guardrail checks (§2) run automatically and block advocacy / third-party posting / non-opted WhatsApp.
- [ ] DEBUNK campaigns are locked out of engagement-maximizing optimization.
- [ ] YouTube + X auto-publish; IG/TikTok fall back to manual export cleanly.
- [ ] Metrics flow back into persona learning.
- [ ] Nothing in HypeMachine overlaps TrustLayer's purpose.
- [ ] §7 open decisions are resolved (or explicitly deferred) before the relevant feature ships.
