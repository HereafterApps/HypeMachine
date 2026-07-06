# Hype Machine — Master Implementation Plan

## 0. Product Definition

Build **Hype Machine**, an AI Influence Factory.

It is not just a scheduler, not just a content generator, and not just an
influencer tool. It is infrastructure for creating and operating long-lived
virtual personas that run configurable campaigns across multiple platforms.

The core model:

```
Influence Factory
  → Persona
    → Persona Memory
    → Persona World / Life
    → Persona Assets
    → Campaigns
      → Campaign Goals
      → Campaign Guardrails
      → Content Prompts
      → Schedules
      → Generated Content
      → Human Approval
      → Publishing
      → Analytics
      → Learning Loop
```

**The persona is the long-term product. Campaigns come and go.**

Example:

```
Professor Steve
  → exists until turned off
  → remembers everything
  → has a consistent face, voice, room, habits, backstory
  → runs GuidedGenius app-promotion campaign
  → later runs another education campaign
  → learns which formats perform best
```

### 0.1 Scope & ethics baseline (settled — not up for re-litigation)

These constraints were decided during planning and shape everything below:

- **Personas are disclosed.** Every persona is openly a virtual/AI-driven
  creator (bio disclosure text, platform-native AI/synthetic-media labels
  where available). A persona is a *channel*, not a disguise.
- **Own-channel engagement only.** Personas reply to comments/DMs on their
  own posts, as themselves. They do not pose as independent, organic human
  users inside third-party threads/communities (Reddit, HN, forums, etc.).
  For this reason there is **no forum-style content type** in the system —
  long-form discussion-style content on the persona's own channels is
  covered by `TEXT_POST` / `THREAD`.
- **No undisclosed fleets of identities.** Multiple personas are fine;
  covert sockpuppets are not — regardless of the message being promoted.
- **WhatsApp = opted-in only.** Broadcast to opted-in subscribers or
  Business API replies to inbound messages. Cold/bulk outreach is a
  permanent non-goal (see §27).
- **Human approval is mandatory** for every outgoing item (see §1.3).

---

## 1. Core Product Rules

### 1.1 Persona-first architecture

A persona is not a disposable bot. It is a persistent virtual creator.

Each persona must have:

- name
- avatar/visual identity
- voice
- tone
- speaking style
- backstory
- memory
- recurring habits
- visual environment
- content preferences
- platform accounts
- campaigns
- analytics history

The persona should feel alive and continuous.

### 1.2 Campaigns are configurable missions

A campaign is a goal that the persona is currently running.

Examples:

- promote GuidedGenius
- build brand awareness
- promote an app
- explain media literacy
- push an idea
- create awareness around a trend
- generate audience engagement around a category

Each campaign has:

- name
- goal
- campaign type
- product/topic being promoted
- directness level
- plug frequency
- source material
- claims allowed
- claims banned
- target audience
- platforms
- content formats
- schedule
- approval settings
- analytics target

### 1.3 Human approval is mandatory

**Nothing is posted automatically.**

Every item must enter an approval queue:

```
Generated → Pending Approval → Approved / Rejected / Needs Edit
          → Scheduled → Published → Tracked
```

This applies to:

- videos
- text posts
- captions
- replies
- comments
- DMs
- WhatsApp messages
- any other outgoing message

### 1.4 Everything is configurable

The user should be able to configure:

- persona type
- visual style
- tone
- backstory
- memory behavior
- content formats
- campaign directness
- plug frequency
- posting intervals
- approval channel
- platform-specific behavior
- ethics/guardrails
- video style
- B-roll source
- reply style
- analytics optimization goal

But the app should ship with strong defaults.

---

## 2. MVP Scope

Even though the eventual product supports everything, build the first
version as a working end-to-end system.

### MVP must include

1. Persona setup
2. Campaign setup
3. Asset upload
4. Content generation
5. Video generation pipeline
6. Text post generation
7. Approval dashboard
8. Email approval notification
9. Discord approval notification
10. Publishing adapter abstraction
11. At least one working publishing adapter
12. Analytics ingestion abstraction
13. Content history
14. Persona memory
15. Campaign learning loop

### MVP content types

Build these first:

- short vertical videos
- text posts
- captions
- reply drafts

### MVP platforms

Design adapters for many platforms, but implement adapters incrementally.

Start with:

- YouTube Shorts upload
- X text post
- manual export fallback for Instagram/TikTok/LinkedIn
- Discord/email approval notifications

The system must be adapter-based so Meta/TikTok/LinkedIn/WhatsApp can be
added later without changing core architecture.

---

## 3. Recommended Tech Stack

Use a monorepo.

### Frontend

- Next.js
- TypeScript
- Tailwind
- shadcn/ui
- React Hook Form
- Zod validation

### Backend

- Node.js
- TypeScript
- Fastify or NestJS
- Prisma ORM
- PostgreSQL
- pgvector for memory/search
- Redis + BullMQ for queues (or AWS SQS/EventBridge if using AWS-native queues)

### Storage

- AWS S3 for uploaded/generated assets
- CloudFront optional
- signed URLs for private previews

### Notifications

- AWS SES for email
- Discord bot or Discord webhook for approval messages

### AI layer

Use provider abstraction. Create AI adapters for:

- LLM text generation
- image generation
- avatar video generation
- voice generation
- B-roll generation
- video rendering
- analytics summarization

**Do not hardcode one vendor.**

### Video providers

Create adapter interfaces for:

- HeyGen
- Synthesia
- ElevenLabs
- Shotstack
- future providers

### Social publishing providers

Create adapter interfaces for:

- YouTube
- X
- TikTok
- Instagram
- Facebook
- Threads
- LinkedIn
- WhatsApp
- manual export

Some providers may start as stubs/manual export only.

---

## 4. Monorepo Structure

```
hype-machine/
  apps/
    web/
      app/
      components/
      lib/
      hooks/
      styles/
    api/
      src/
        modules/
        routes/
        workers/
        jobs/
        services/
        adapters/
        lib/

  packages/
    db/
      prisma/
      src/
    core/
      src/
        types/
        constants/
        utils/
    ai/
      src/
        llm/
        prompts/
        schemas/
        evaluators/
    video/
      src/
        providers/
        renderer/
        storyboard/
    publishing/
      src/
        providers/
        youtube/
        x/
        tiktok/
        instagram/
        facebook/
        linkedin/
        whatsapp/
        manual/
    notifications/
      src/
        email/
        discord/
    analytics/
      src/
        providers/
        scoring/
        insights/
    guardrails/
      src/
        policy/
        checks/
        schemas/
    memory/
      src/
        embeddings/
        retrieval/
        summarization/

  campaign-template/
    persona.yml
    ethics.yml
    campaigns/
      guidedgenius.yml
    assets/
    prompts/
      video.yml
      text.yml
      replies.yml

  docs/
    product-plan.md
    architecture.md
    provider-notes.md
    setup.md
```

---

## 5. Data Model

Use PostgreSQL + Prisma.

### 5.1 User

For now, single-user mode is acceptable, but design for multi-user later.

```
User {
  id
  name
  email
  role
  createdAt
  updatedAt
}
```

Roles: `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`

For v1, only `OWNER` is required.

### 5.2 Persona

```
Persona {
  id
  ownerId
  name
  slug
  status // ACTIVE, PAUSED, ARCHIVED
  personaType
  description
  backstory
  worldview
  speakingStyle
  tone
  humorStyle
  disclosureText
  defaultLanguage
  defaultPlatformTone
  memoryEnabled
  createdAt
  updatedAt
}
```

Persona types:

`VIRTUAL_INFLUENCER`, `BRAND_MASCOT`, `CARTOON`, `PUPPET`, `EXPERT`,
`PROFESSOR`, `FOUNDER_AVATAR`, `FACELESS_CHANNEL`, `SATIRICAL_CHARACTER`,
`CUSTOM`

### 5.3 PersonaMemory

```
PersonaMemory {
  id
  personaId
  type
  title
  content
  importance
  source
  embedding
  createdAt
  updatedAt
}
```

Memory types:

`BACKSTORY`, `OPINION`, `HABIT`, `RECURRING_JOKE`, `PAST_POST`,
`AUDIENCE_REACTION`, `CAMPAIGN_LEARNING`, `VISUAL_DETAIL`,
`BANNED_BEHAVIOR`, `SUCCESSFUL_HOOK`, `FAILED_HOOK`

### 5.4 PersonaAsset

```
PersonaAsset {
  id
  personaId
  type
  name
  url
  s3Key
  metadata
  isDefault
  createdAt
}
```

Asset types:

`FACE_REFERENCE`, `AVATAR_LOOK`, `VOICE_SAMPLE`, `ROOM_BACKGROUND`,
`OUTFIT`, `INTRO`, `OUTRO`, `MUSIC`, `CAPTION_STYLE`, `LOGO`, `BROLL`,
`SCREEN_RECORDING`, `THUMBNAIL_STYLE`

### 5.5 Campaign

```
Campaign {
  id
  personaId
  name
  slug
  status // ACTIVE, PAUSED, ARCHIVED
  campaignType
  objective
  targetAudience
  productName
  productDescription
  productUrl
  directnessLevel
  plugFrequency
  primaryKpi
  secondaryKpis
  startDate
  endDate
  createdAt
  updatedAt
}
```

Campaign types:

`APP_PROMOTION`, `BRAND_AWARENESS`, `PRODUCT_LAUNCH`, `TREND_PROMOTION`,
`MEDIA_LITERACY`, `EXPLAINER`, `COMMUNITY_BUILDING`, `CUSTOM`

Directness:

`VERY_SUBTLE`, `SUBTLE`, `CASUAL`, `DIRECT`, `HARD_CTA`

Plug frequency:

`EVERY_POST`, `MOST_POSTS`, `HALF_POSTS`, `WHEN_NATURAL`, `OCCASIONAL`,
`RARE`, `CUSTOM_PERCENTAGE`

### 5.6 CampaignSource

Stores uploaded docs, URLs, notes, brand guidelines, product info.

```
CampaignSource {
  id
  campaignId
  type
  title
  content
  url
  fileUrl
  embedding
  createdAt
}
```

Types:

`PRODUCT_DOC`, `BRAND_GUIDELINES`, `WEBSITE_COPY`, `APP_SCREENSHOT`,
`APP_VIDEO`, `USER_NOTE`, `COMPETITOR`, `CLAIM_BANK`, `FAQ`, `CUSTOM`

### 5.7 Ethics / Guardrail Config

Each campaign has editable guardrails.

```
GuardrailConfig {
  id
  campaignId
  allowedTopics
  bannedTopics
  allowedClaims
  bannedClaims
  requiredDisclosures
  competitorRules
  aggressionLevel
  sensitiveTopicRules
  escalationRules
  platformSpecificRules
  createdAt
  updatedAt
}
```

Aggression level:

`SOFT`, `NORMAL`, `SPICY`, `CONTRARIAN`, `AGGRESSIVE_BUT_SAFE`

### 5.8 PlatformAccount

```
PlatformAccount {
  id
  personaId
  platform
  handle
  displayName
  profileUrl
  authStatus
  accessTokenEncrypted
  refreshTokenEncrypted
  tokenExpiresAt
  metadata
  createdAt
  updatedAt
}
```

Platforms:

`YOUTUBE`, `TIKTOK`, `INSTAGRAM`, `FACEBOOK`, `X`, `THREADS`, `LINKEDIN`,
`WHATSAPP`, `DISCORD`, `MANUAL_EXPORT`

### 5.9 ContentSchedule

```
ContentSchedule {
  id
  campaignId
  platform
  contentType
  cadenceType
  intervalMinutes
  cronExpression
  timezone
  isActive
  nextRunAt
  createdAt
  updatedAt
}
```

Content types:

`SHORT_VIDEO`, `TEXT_POST`, `THREAD`, `IMAGE_CAROUSEL`, `REPLY`,
`DM_REPLY`, `WHATSAPP_MESSAGE`

> Note: `WHATSAPP_MESSAGE` is limited to opted-in subscriber broadcasts or
> Business API replies to inbound messages (see §0.1). There is
> deliberately no forum-style content type (see §0.1).

### 5.10 GeneratedContent

```
GeneratedContent {
  id
  personaId
  campaignId
  platform
  contentType
  status
  title
  hook
  script
  caption
  bodyText
  hashtags
  cta
  generationPrompt
  generationMetadata
  riskScore
  guardrailResult
  scheduledFor
  createdAt
  updatedAt
}
```

Statuses:

`DRAFT_GENERATED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`,
`NEEDS_EDIT`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `ARCHIVED`

### 5.11 VideoAsset

```
VideoAsset {
  id
  generatedContentId
  status
  storyboardJson
  voiceUrl
  avatarVideoUrl
  brollUrls
  finalVideoUrl
  thumbnailUrl
  subtitlesUrl
  provider
  providerJobId
  error
  createdAt
  updatedAt
}
```

### 5.12 Approval

```
Approval {
  id
  generatedContentId
  status
  requestedVia
  approvedByUserId
  rejectionReason
  editInstruction
  approvedAt
  rejectedAt
  createdAt
}
```

Approval actions:

`APPROVE`, `REJECT`, `EDIT`, `REGENERATE`, `MAKE_FUNNIER`, `MAKE_SHORTER`,
`MAKE_MORE_SUBTLE`, `MAKE_MORE_DIRECT`, `CHANGE_HOOK`, `CHANGE_CTA`,
`CHANGE_PLATFORM`, `CHANGE_VISUAL_STYLE`

### 5.13 PublishedPost

```
PublishedPost {
  id
  generatedContentId
  platform
  platformPostId
  platformUrl
  publishedAt
  status
  rawResponse
  createdAt
}
```

### 5.14 AnalyticsSnapshot

```
AnalyticsSnapshot {
  id
  publishedPostId
  views
  likes
  comments
  shares
  saves
  clicks
  engagementRate
  sentimentScore
  rawMetrics
  capturedAt
}
```

### 5.15 LearningInsight

```
LearningInsight {
  id
  personaId
  campaignId
  platform
  contentType
  insight
  evidence
  confidence
  actionRecommendation
  createdAt
}
```

---

## 6. Frontend Pages

### 6.1 Main Navigation

Left sidebar:

- Dashboard
- Personas
- Campaigns
- Content Queue
- Approvals
- Calendar
- Assets
- Analytics
- Settings

### 6.2 Dashboard

The dashboard should answer: *"What is the influence factory doing right now?"*

Sections:

- Active persona
- Active campaigns
- Pending approvals
- Next scheduled generations
- Recent published content
- Top-performing content
- Latest AI learnings
- Failed jobs / warnings

Example cards:

```
Pending Approvals: 8
Scheduled Today: 4
Videos Generated: 12
Posts Published: 17
Total Views: 42,300
Engagement Rate: 6.4%
Top Platform: YouTube Shorts
Best Hook: "I'm 80 and even I think this is obvious…"
```

### 6.3 Persona List

Persona cards, each showing:

- avatar image
- name
- type
- status
- active campaigns
- platforms connected
- last content generated
- total views
- open button

### 6.4 Persona Setup Wizard

**Step 1: Basic Identity**

Fields: persona name, persona type, age / apparent age, short description,
bio, disclosure text, language, tone.

Example:

> Professor Steve — An 80-year-old virtual professor who reacts to internet
> trends and casually explains why smarter learning tools matter.

**Step 2: Personality**

Fields: backstory, worldview, speaking style, humor style, recurring
phrases, things they love, things they hate, emotional range, default CTA
style.

**Step 3: Visual Identity**

Fields: upload reference images, generate avatar from prompt, approve
avatar, select default room/background, define outfits, define camera
style.

Camera style options: `WEBCAM_DESK`, `PHONE_SELFIE`, `PODCAST_SETUP`,
`OUTDOOR_WALKING`, `STUDIO`, `GREENSCREEN`, `CUSTOM`

**Step 4: Voice**

Fields: upload voice sample, choose provider voice, generate voice from
prompt, select default voice, test voice.

**Step 5: Platform Accounts**

Connect: YouTube, X, TikTok, Instagram, LinkedIn, Facebook, WhatsApp,
manual export.

For v1, make most of these connect buttons visible but disabled/coming
soon if not implemented.

**Step 6: Memory Settings**

Options: remember posts, remember campaign outcomes, remember audience
comments, remember successful hooks, remember failed hooks, remember
personal lore, memory strictness.

### 6.5 Persona Detail Page

Tabs: Overview, Memory, Campaigns, Assets, Content, Analytics, Settings.

### 6.6 Campaign List

Campaigns grouped by persona. Campaign card shows:

- campaign name
- type
- status
- objective
- platforms
- next generation
- pending approvals
- views
- engagement

### 6.7 Campaign Setup Wizard

**Step 1: Campaign Basics**

Fields: campaign name, campaign type, objective, target audience,
product/topic name, product/topic description, URL, start/end date, active
status.

**Step 2: Campaign Strategy**

Fields: main message, secondary messages, audience pain points, desired
audience belief, emotional angle, proof points, objections to handle,
campaign directness, plug frequency.

Example:

```
Campaign: GuidedGenius
Type: Indirect App Promotion
Persona: Professor Steve
Directness: Casual
Plug Frequency: 60%
Message: Smarter learning is interactive, not passive.
Product Line: "I've been using GuidedGenius, and damn, it's awesome.
              I'm not even the target audience."
```

**Step 3: Source Material**

Allow: paste notes, upload PDFs/docs, upload screenshots, upload app demo
videos, add website URL, add competitor notes, add claim bank, add FAQ.

**Step 4: Content Configuration**

Configure per content type:

- Short Videos
- Text Posts
- Threads
- Replies
- Image Posts
- WhatsApp Messages (opted-in only, see §0.1)

Each content type has: enabled/disabled, generation prompt, cadence,
directness, length, platform mapping, approval required, risk level.

**Step 5: Platform Mapping**

For each platform: enabled, account, formats allowed, posting cadence,
best posting window, hashtag rules, caption rules, CTA rules, native
disclosure rules, manual export if API not connected.

**Step 6: Guardrails**

Editable campaign guardrails: allowed topics, banned topics, allowed
claims, banned claims, proof requirements, competitor mention rules,
political/sensitive topic rules, escalation rules, required disclaimers,
words/phrases to avoid.

**Step 7: Approval Settings**

Options: approval channel (dashboard/email/Discord), approval timeout
behavior, batch approvals enabled/disabled, who can approve, default
scheduled delay after approval, whether approved content publishes
immediately or at scheduled time.

### 6.8 Content Queue

Show all generated items.

Filters: persona, campaign, platform, content type, status, risk level,
scheduled date.

Content card shows: platform, content type, title/hook, caption/body,
video preview if exists, status, generated reason, guardrail result, AI
confidence, actions.

Actions:

Approve · Reject · Edit · Regenerate · Make funnier · Make shorter ·
Make more subtle · Make more direct · Change hook · Change CTA ·
Change visual style · Schedule · Archive

### 6.9 Approval Detail Page

For a **video** approval, show:

- final video preview
- script
- caption
- hashtags
- thumbnail
- campaign plug explanation
- platform destination
- scheduled time
- guardrail checklist
- AI reasoning: why this should perform
- prior related content
- approve/reject/edit buttons

For a **text** approval, show:

- post body
- hashtags
- platform preview
- expected performance rationale
- guardrail checklist
- approve/reject/edit buttons

### 6.10 Calendar

Show: scheduled generations, scheduled posts, published posts, failed
jobs, campaign waves.

Views: week, month, campaign, platform.

### 6.11 Assets

Asset library with folders: Persona Assets, Campaign Assets, B-roll,
Screen Recordings, Music, Thumbnails, Captions, Logos, Generated Videos.

### 6.12 Analytics

Show: views, likes, comments, shares, saves, clicks, engagement rate,
platform breakdown, campaign breakdown, content type breakdown, best
hooks, worst hooks, best posting times, top-performing videos,
top-performing text posts, AI-generated learning insights.

### 6.13 Settings

Sections: AI providers, video providers, voice providers, publishing
providers, notification providers, API keys, user profile, timezone,
default approval behavior, storage settings.

---

## 7. Backend Modules

### 7.1 Persona Module

Responsibilities: create/update/archive persona, store persona memory,
retrieve persona context, manage persona assets, build persona prompt
context.

Core functions:

```
createPersona(input)
updatePersona(id, input)
getPersona(id)
listPersonas()
addPersonaMemory(personaId, memory)
searchPersonaMemory(personaId, query)
summarizePersonaMemory(personaId)
```

### 7.2 Campaign Module

Responsibilities: create/update campaign, activate/pause campaign, manage
sources, manage guardrails, manage schedules, build campaign prompt
context.

Core functions:

```
createCampaign(personaId, input)
updateCampaign(campaignId, input)
getCampaign(campaignId)
listCampaigns(personaId)
addCampaignSource(campaignId, source)
getCampaignContext(campaignId)
```

### 7.3 Generation Module

Responsibilities: generate content at scheduled intervals, retrieve
persona/campaign context, call LLM, validate output schema, run guardrail
checks, create GeneratedContent records, trigger video jobs if needed,
send approval notification.

Core job:

```
GenerateContentJob
  → load schedule
  → load persona
  → load campaign
  → retrieve relevant memory
  → retrieve source material
  → build prompt
  → generate structured content
  → run guardrails
  → save GeneratedContent
  → if video: enqueue VideoGenerationJob
  → notify approval channel
```

### 7.4 Video Module

Responsibilities: convert approved/generation script into a finished
video — avatar video generation, voice generation, b-roll, captions, final
render, asset storage.

Pipeline:

```
Generate script
  → generate storyboard
  → generate/choose voice
  → generate avatar segment
  → choose/generate b-roll
  → assemble timeline
  → render final video
  → generate thumbnail
  → generate captions
  → save preview
  → approval queue
```

Provider abstraction:

```ts
interface AvatarVideoProvider {
  createAvatarVideo(input): Promise<AvatarVideoJob>
  getAvatarVideoStatus(jobId): Promise<AvatarVideoResult>
}

interface VoiceProvider {
  generateSpeech(input): Promise<VoiceResult>
}

interface VideoRenderer {
  renderTimeline(input): Promise<RenderJob>
  getRenderStatus(jobId): Promise<RenderResult>
}
```

### 7.5 Approval Module

Responsibilities: create approval request, approve/reject/edit/regenerate
content, track approval history, trigger publishing after approval.

Core functions:

```
requestApproval(generatedContentId)
approveContent(generatedContentId, userId)
rejectContent(generatedContentId, reason)
editContent(generatedContentId, edits)
regenerateContent(generatedContentId, instruction)
```

### 7.6 Publishing Module

Responsibilities: publish approved content, handle platform auth, store
platform response, retry failures, support manual export.

Provider interface:

```ts
interface PublishingProvider {
  platform: Platform
  publish(input): Promise<PublishResult>
  getPostMetrics(platformPostId): Promise<AnalyticsMetrics>
}
```

Implement: `YouTubeProvider`, `XProvider`, `ManualExportProvider`

Stub: `TikTokProvider`, `InstagramProvider`, `LinkedInProvider`,
`FacebookProvider`, `WhatsAppProvider`, `ThreadsProvider`

Manual export should allow downloading: video, caption, hashtags,
thumbnail, post metadata.

### 7.7 Notification Module

Responsibilities: send email approval notifications, send Discord approval
notifications, include approval links, notify on failures, notify on
publishing success, notify on analytics milestones.

Email approval message should include:

```
New content generated for Professor Steve / GuidedGenius

Type: Short Video
Platform: YouTube Shorts
Hook: "I'm 80 and even I know this is how kids should learn now."
Risk: Low
Scheduled: Today 7:30 PM

Approve: [button]
Edit: [button]
Reject: [button]
Open Dashboard: [button]
```

Discord message should include: title, preview link, campaign, platform,
buttons if possible, dashboard link.

### 7.8 Analytics Module

Responsibilities: fetch metrics, normalize metrics, calculate engagement
rate, store snapshots, generate insights, update persona/campaign memory.

Analytics job:

```
AnalyticsIngestionJob
  → fetch published posts
  → call provider metrics
  → normalize metrics
  → save snapshot
  → compare to baseline
  → generate learning insight
  → store insight in memory
```

### 7.9 Guardrails Module

Responsibilities: apply campaign guardrails, detect banned claims, check
required disclaimers, check aggressive language, check platform-specific
risks, return risk score, block or warn depending on settings.

Guardrail result:

```ts
{
  passed: boolean
  riskScore: number
  warnings: string[]
  blockers: string[]
  requiredEdits: string[]
}
```

---

## 8. Prompt System

Use structured prompts with strict JSON output.

### 8.1 Persona Context Prompt

The AI must receive:

```
Persona:
- name
- backstory
- personality
- speaking style
- visual style
- memory highlights
- recurring jokes
- platform-specific tone
```

### 8.2 Campaign Context Prompt

```
Campaign:
- goal
- product/topic
- target audience
- directness level
- plug frequency
- source material
- allowed claims
- banned claims
- desired CTA
- current campaign learnings
```

### 8.3 Platform Context Prompt

```
Platform:
- platform name
- content format
- max length
- style conventions
- hashtag rules
- CTA rules
- disclosure rules
```

### 8.4 Generate Short Video Prompt

Expected JSON:

```json
{
  "title": "string",
  "hook": "string",
  "script": "string",
  "caption": "string",
  "hashtags": ["string"],
  "cta": "string",
  "visualDirection": "string",
  "cameraStyle": "string",
  "outfitSuggestion": "string",
  "brollPlan": [
    {
      "timestamp": "0:03-0:06",
      "description": "string",
      "source": "AI_GENERATED | USER_ASSET | SCREEN_RECORDING | STOCK"
    }
  ],
  "thumbnailIdea": "string",
  "campaignPlugType": "NONE | SUBTLE | CASUAL | DIRECT",
  "whyThisShouldWork": "string",
  "riskNotes": ["string"]
}
```

### 8.5 Generate Text Post Prompt

Expected JSON:

```json
{
  "body": "string",
  "hook": "string",
  "cta": "string",
  "hashtags": ["string"],
  "campaignPlugType": "NONE | SUBTLE | CASUAL | DIRECT",
  "whyThisShouldWork": "string",
  "riskNotes": ["string"]
}
```

### 8.6 Generate Reply Prompt

For replies on the persona's own posts/DMs (see §0.1). Expected JSON:

```json
{
  "reply": "string",
  "tone": "string",
  "shouldMentionCampaign": true,
  "campaignMention": "string",
  "riskLevel": "LOW | MEDIUM | HIGH",
  "escalateToHuman": false,
  "reason": "string"
}
```

---

## 9. Video Generation Pipeline Detail

### 9.1 Video concept generation

Input: persona, campaign, platform, schedule, recent performance, memory,
source assets.

Output: structured short video plan.

### 9.2 Script generation

Script should include:

- 1–2 second hook
- short setup
- main point
- personality moment
- campaign plug if configured
- CTA
- length target

Default short video length: **20–45 seconds**, configurable per campaign.

### 9.3 Avatar generation

Use selected avatar provider.

Inputs: avatar ID / image reference, script or audio URL, aspect ratio
9:16, background, outfit/look config, motion prompt, callback URL.

Save: provider job ID, avatar video URL, status.

### 9.4 Voice generation

If avatar provider does not handle voice well, use voice provider.

Inputs: script, voice ID, speaking style, emotion, speed, pronunciation
dictionary if needed.

Save: audio URL, duration, provider metadata.

### 9.5 B-roll generation

B-roll can come from:

- user uploaded app demo clips
- uploaded product videos
- AI-generated clips
- AI-generated images
- screenshots
- stock/manual assets later

For GuidedGenius example: screen recording of app use, app UI closeups,
animated text overlays, Professor Steve webcam reaction cuts.

### 9.6 Final assembly

Use renderer provider. Timeline should include:

- avatar base video
- b-roll overlays
- jump cuts
- captions
- music
- sound effects
- intro/outro if configured
- watermark/disclosure if configured
- final 9:16 render

Save final MP4 to S3.

### 9.7 Thumbnail generation

Generate: frame capture, title overlay, platform-specific thumbnail if
needed.

---

## 10. Scheduling System

Each schedule belongs to campaign + platform + content type.

Schedule examples:

```
YouTube Shorts: 1 video daily at 7 PM
X: 3 text posts daily
Instagram Reels: 1 video every 2 days
Replies: check every 6 hours
Analytics: check every 12 hours
```

Schedule config supports: fixed cron, interval, platform-specific cadence,
timezone, active/pause, max daily generation count, quiet hours.

Generation jobs should respect: campaign status, persona status, platform
enabled, approval backlog limit, duplicate content avoidance, recent
content memory.

---

## 11. Approval Workflow

### 11.1 New content

```
Generation job completes
  → content saved as PENDING_APPROVAL
  → notification sent
  → user reviews
  → user approves/rejects/edits/regenerates
```

### 11.2 Approve

```
If scheduledFor exists:
  → mark SCHEDULED
  → publish at scheduled time
Else:
  → publish immediately or ask for schedule depending on config
```

### 11.3 Reject

- ask for reason
- save reason
- create learning memory
- optionally regenerate

### 11.4 Edit

User can edit: script, caption, hashtags, CTA, schedule, platform,
thumbnail, visual notes.

If video content changes materially, regenerate final video.

### 11.5 Regenerate quick actions

Buttons:

Regenerate · Make funnier · Make shorter · Make more subtle ·
Make more direct · Change hook · Change CTA · Change visual style ·
Less product plug · More product plug

Each button creates a regeneration instruction.

---

## 12. Analytics and Learning Loop

### 12.1 Metrics

Track: views, likes, comments, shares, saves, clicks, engagement rate,
follower growth, completion rate if available, sentiment if comments
available.

### 12.2 Learning levels

Generate insights at four levels:

- **Persona-level:** "Steve's rants work better than calm explanations."
- **Campaign-level:** "GuidedGenius performs best when framed around
  parents and homework stress."
- **Platform-level:** "YouTube Shorts likes 30-second webcam videos; X
  likes spicy text posts."
- **Format-level:** "B-roll-heavy videos outperform pure talking head by
  1.8x."

### 12.3 Memory update

Every learning insight should become memory.

Example:

```
Memory:
Type: CAMPAIGN_LEARNING
Content: GuidedGenius plugs perform better when Steve says he personally
         used the app, rather than making a generic claim.
Confidence: 0.76
```

### 12.4 Future generation

Generation prompts must include recent learnings. The AI should adapt:
hook style, length, CTA, posting time, plug frequency, content bucket,
visual style, platform format.

---

## 13. First Concrete Persona Template

Ship with a starter persona:

```
Name: Professor Steve
Type: Virtual Influencer / Professor
Apparent Age: 80
Visual Style: old professor on webcam, messy desk, books, tea mug,
              slightly chaotic lighting
Voice: warm, blunt, amused, intelligent
Personality: old but internet-aware, funny, sharp, mildly grumpy,
             surprisingly open-minded
Default Content Style: reacts to learning, tech, internet trends,
                       education myths
Default Campaign Style: indirect/casual app promotion
Recurring Line: "I'm not even the target audience, and even I get it."
```

---

## 14. First Concrete Campaign Template

Ship with a starter campaign:

```
Campaign: GuidedGenius
Type: App Promotion + Brand Awareness
Persona: Professor Steve
Directness: Casual
Plug Frequency: 60%
Goal: Get views and engagement while making GuidedGenius feel useful,
      smart, and worth trying.
Message: Learning should feel interactive, not like staring at a dead PDF.
Product Mention Style: "I've been using this app called GuidedGenius, and
                        damn, it's awesome. I'm not even the target
                        audience."
Primary Content: Short vertical videos
Secondary Content: Text posts
Platforms: YouTube Shorts, X, manual export for TikTok/Instagram
```

---

## 15. Example Generated Video

The app should be able to generate a video like this:

**Title:** I'm 80 and this learning app made me jealous

**Hook:** I'm 80 years old and I just found an app that teaches better
than half the textbooks I grew up with.

**Script:**

> You know what we used to call "interactive learning"? A teacher throwing
> chalk at the board and hoping the child stayed awake.
>
> Now I'm looking at this thing called GuidedGenius, and it actually talks
> the student through the problem. It asks, explains, adjusts, and doesn't
> make the child feel stupid.
>
> And listen, I'm not even the target audience. I'm an old man with a
> suspicious relationship with technology.
>
> But if I had this when I was teaching? Good grief. I would've saved
> thousands of hours.

**Caption:** Professor Steve discovers GuidedGenius and gets mildly
offended that students have better tools now.

**CTA:** Try GuidedGenius if you want learning to feel less passive.

**Visual:** Steve at webcam. Cut to app screen recording. Cut back to
Steve squinting. Add captions. Add subtle zooms.

---

## 16. Provider Adapter Design

### 16.1 LLM adapter

```ts
interface LlmProvider {
  generateStructured<T>(input: {
    systemPrompt: string
    userPrompt: string
    schema: z.ZodSchema<T>
    temperature?: number
  }): Promise<T>
}
```

### 16.2 Avatar provider

```ts
interface AvatarProvider {
  createVideo(input: {
    avatarId: string
    script?: string
    audioUrl?: string
    aspectRatio: "9:16" | "16:9" | "1:1"
    background?: string
    motionPrompt?: string
    callbackUrl?: string
  }): Promise<{
    jobId: string
    status: "queued" | "processing" | "complete" | "failed"
  }>

  getVideo(jobId: string): Promise<{
    status: string
    videoUrl?: string
    error?: string
  }>
}
```

### 16.3 Voice provider

```ts
interface VoiceProvider {
  generate(input: {
    text: string
    voiceId: string
    style?: string
    speed?: number
  }): Promise<{
    audioUrl: string
    duration?: number
  }>
}
```

### 16.4 Renderer provider

```ts
interface RenderProvider {
  render(input: {
    timeline: VideoTimeline
    outputFormat: "mp4"
    aspectRatio: "9:16" | "16:9" | "1:1"
    callbackUrl?: string
  }): Promise<{
    jobId: string
  }>

  getRender(jobId: string): Promise<{
    status: string
    videoUrl?: string
    error?: string
  }>
}
```

### 16.5 Publishing provider

```ts
interface PublishingProvider {
  publish(input: {
    platformAccountId: string
    content: GeneratedContent
    videoUrl?: string
    imageUrls?: string[]
  }): Promise<{
    platformPostId: string
    platformUrl?: string
    rawResponse: unknown
  }>

  fetchMetrics(platformPostId: string): Promise<AnalyticsMetrics>
}
```

---

## 17. API Routes

### Persona routes

```
GET    /personas
POST   /personas
GET    /personas/:id
PATCH  /personas/:id
DELETE /personas/:id
POST   /personas/:id/assets
GET    /personas/:id/memory
POST   /personas/:id/memory
```

### Campaign routes

```
GET    /campaigns
POST   /campaigns
GET    /campaigns/:id
PATCH  /campaigns/:id
DELETE /campaigns/:id
POST   /campaigns/:id/sources
POST   /campaigns/:id/schedules
GET    /campaigns/:id/analytics
```

### Generation routes

```
POST   /generation/run
POST   /generation/run/:campaignId
POST   /generation/regenerate/:contentId
```

### Content routes

```
GET    /content
GET    /content/:id
PATCH  /content/:id
DELETE /content/:id
```

### Approval routes

```
GET    /approvals
GET    /approvals/:id
POST   /approvals/:id/approve
POST   /approvals/:id/reject
POST   /approvals/:id/edit
POST   /approvals/:id/regenerate
```

### Publishing routes

```
POST   /publish/:contentId
GET    /published
GET    /published/:id/metrics
```

### Settings routes

```
GET    /settings/providers
PATCH  /settings/providers
POST   /settings/test-email
POST   /settings/test-discord
```

---

## 18. Job Queue

Create these jobs:

```
GenerateScheduledContentJob
GenerateContentJob
GenerateVideoJob
CheckVideoProviderStatusJob
SendApprovalNotificationJob
PublishApprovedContentJob
FetchAnalyticsJob
GenerateLearningInsightsJob
UpdateMemoryJob
```

### 18.1 GenerateScheduledContentJob

Runs every minute. Find schedules where:

```
isActive = true
nextRunAt <= now
campaign.status = ACTIVE
persona.status = ACTIVE
```

Then enqueue `GenerateContentJob`.

### 18.2 GenerateVideoJob

Steps:

```
load GeneratedContent
generate storyboard if missing
create voice if needed
create avatar video
generate/select b-roll
render final timeline
save VideoAsset
mark content PENDING_APPROVAL
send approval notification
```

### 18.3 PublishApprovedContentJob

Steps:

```
load approved content
load platform account
call provider publish
save PublishedPost
mark content PUBLISHED
notify user
```

### 18.4 FetchAnalyticsJob

Runs every few hours. Steps:

```
load published posts
call provider metrics
save snapshot
if meaningful change:
  generate insight
  save memory
```

---

## 19. Guardrail Checklist

Before approval, every item should show:

- ✅ Persona consistency
- ✅ Campaign relevance
- ✅ Product claim allowed
- ✅ Banned claims avoided
- ✅ Tone within settings
- ✅ Platform compatible
- ✅ Required disclosure included
- ✅ No duplicate of recent post
- ✅ CTA matches campaign directness
- ✅ Risk score acceptable

If not passed, show warnings and allow user override **only for
non-blocking issues**.

---

## 20. Config File Templates

Also create YAML export/import support.

### persona.yml

```yaml
name: Professor Steve
type: PROFESSOR
status: ACTIVE
description: 80-year-old virtual professor who reacts to internet trends and learning tools.
backstory: Retired professor, internet-curious, sharp, funny, slightly grumpy.
tone: warm, blunt, amused
speakingStyle: short sentences, dry jokes, direct opinions
defaultLanguage: en
memoryEnabled: true
visual:
  defaultCameraStyle: WEBCAM_DESK
  faceConsistency: SAME_FACE
  outfitVariation: true
  locationVariation: limited
disclosure:
  bioText: Virtual AI-driven professor character.
```

### campaign.yml

```yaml
name: GuidedGenius
type: APP_PROMOTION
status: ACTIVE
objective: Build awareness and engagement for GuidedGenius.
targetAudience: parents, students, teachers, edtech users
productName: GuidedGenius
productUrl: https://guidedgenius.com
directnessLevel: CASUAL
plugFrequency:
  mode: CUSTOM_PERCENTAGE
  percentage: 60
primaryKpi: VIEWS
secondaryKpis:
  - ENGAGEMENT
  - CLICKS
message:
  main: Learning should be interactive, adaptive, and less boring.
  productLine: "I've been using this app called GuidedGenius, and damn, it's awesome. I'm not even the target audience."
content:
  shortVideo:
    enabled: true
    cadence: daily
    defaultLengthSeconds: 35
  textPost:
    enabled: true
    cadence: twice_daily
platforms:
  youtube:
    enabled: true
    contentTypes: [SHORT_VIDEO]
  x:
    enabled: true
    contentTypes: [TEXT_POST]
  tiktok:
    enabled: false
    mode: MANUAL_EXPORT
```

### ethics.yml

```yaml
allowedTopics:
  - education
  - learning
  - edtech
  - student motivation
  - AI tutoring
bannedTopics:
  - medical claims
  - guaranteed academic outcomes
  - personal attacks
allowedClaims:
  - GuidedGenius helps make learning interactive.
  - GuidedGenius can help explain concepts.
bannedClaims:
  - Guaranteed marks improvement.
  - Replaces all teachers.
  - Works for every child.
requiredDisclosures:
  - Use platform-native AI/synthetic media labels where available.
competitorRules:
  allowCompetitorMentions: false
aggressionLevel: NORMAL
escalationRules:
  - If user asks legal/medical/sensitive question, escalate to human.
```

---

## 21. Build Phases

### Phase 1 — Foundation

Deliver: monorepo setup, database schema, Prisma models, basic
auth/single-user mode, dashboard shell, persona CRUD, campaign CRUD, asset
upload to S3, settings page.

Acceptance: user can create persona, create campaign, upload assets; data
persists.

### Phase 2 — Content Generation

Deliver: LLM provider adapter, prompt templates, structured video idea
generation, structured text post generation, generated content queue,
guardrail checks, content preview.

Acceptance: user can generate text post and video plan/script; generated
content appears in queue; guardrail checklist appears.

### Phase 3 — Approval System

Deliver: approval dashboard, approve/reject/edit/regenerate, email
notification, Discord notification, approval history.

Acceptance: generated content triggers approval request; user can
approve/reject/edit; Discord/email links open content detail.

### Phase 4 — Video Pipeline

Deliver: video provider interfaces, one avatar provider implementation,
one voice provider implementation, one render provider implementation,
final MP4 generation, preview in dashboard, thumbnail/subtitle storage.

Acceptance: system creates a finished vertical video from campaign config;
final video can be previewed and approved.

### Phase 5 — Publishing

Deliver: YouTube publishing provider, X publishing provider, manual export
provider, scheduled publishing, published post tracking.

Acceptance: approved video can publish to YouTube or export manually;
approved text post can publish to X or export manually; published URL is
stored.

### Phase 6 — Analytics

Deliver: metrics fetch abstraction, YouTube metrics if available, X
metrics if available, manual metric entry fallback, analytics dashboard,
learning insight generation.

Acceptance: published posts show metrics; system generates learning
insights; future content uses insights.

### Phase 7 — Polish

Deliver: campaign templates, persona templates, better onboarding, failed
job handling, retry controls, logs, cost tracking, provider health page.

Acceptance: non-technical user can set up Professor Steve + GuidedGenius
and run the full loop.

---

## 22. Required UX Quality

The app should feel like a **control room**.

Design language: dark mode first, clean dashboard, cards, timelines,
approval queue, video previews, clear status badges, strong empty states,
obvious next actions.

Status colors:

| Status | Color |
|---|---|
| Draft | gray |
| Pending Approval | amber |
| Approved | blue |
| Scheduled | purple |
| Published | green |
| Failed | red |
| Rejected | dark gray |

---

## 23. Critical Edge Cases

Handle:

- provider API failure
- video generation timeout
- duplicate content generation
- missing platform auth
- approval link expired
- content approved but platform publish fails
- analytics provider unavailable
- token expired
- asset missing
- campaign paused while job is running
- persona paused while scheduled jobs exist
- generation produces invalid JSON
- guardrail failure
- video too long for platform
- no available B-roll
- manual export platform

---

## 24. Logging and Observability

Every job should log: job ID, persona ID, campaign ID, content ID,
provider used, status, duration, error.

Create an admin/job page: Jobs, Provider Calls, Failures, Retries, Costs.

---

## 25. Cost Tracking

Track approximate cost per generated item:

- LLM cost
- image cost
- voice cost
- avatar cost
- render cost
- storage cost
- publishing cost
- total cost

Show: cost per campaign, cost per persona, cost per published post, cost
per 1,000 views.

---

## 26. First End-to-End Demo Scenario

Build the demo around this:

**Persona:** Professor Steve
**Campaign:** GuidedGenius app promotion

User flow:

1. User creates Professor Steve.
2. User uploads Steve face reference.
3. User creates GuidedGenius campaign.
4. User uploads app screen recording.
5. User sets schedule: 1 video/day, 2 text posts/day.
6. User clicks "Generate Now."
7. System creates a text post and short video.
8. User gets Discord/email approval.
9. User opens dashboard.
10. User previews final video.
11. User clicks approve.
12. System publishes or exports.
13. Metrics are pulled later.
14. System says: "Videos with Steve reacting to app UI got better
    engagement."
15. Future content uses that learning.

---

## 27. Non-Goals for V1

Do not build yet:

- multi-client billing
- agency workspace management
- fully autonomous posting
- mass DM tools
- cold WhatsApp outreach
- complex team permissions
- paid ad buying
- influencer marketplace
- native mobile app
- advanced trend scraping
- full social listening suite

(Note: cold WhatsApp outreach, mass DM tools, and undisclosed/covert
engagement are permanent exclusions per §0.1, not just deferred.)

---

## 28. Final Product North Star

The app is successful when the user can say:

> "I created a virtual persona, gave it a campaign, connected accounts,
> set generation intervals, reviewed everything before publishing, and the
> system learned from performance to make better content next time."

That is the core loop:

```
Persona → Campaign → Generate → Approve → Publish → Measure → Learn → Generate Better
```

**Build that loop first.**
