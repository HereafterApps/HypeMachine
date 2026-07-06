# Hype Machine — Planning

## What this is

A monorepo system for creating one or more **branded, disclosed AI personas**
("virtual creators") that generate and publish content across multiple
platforms in service of a single goal per fork — e.g. hyping a product,
promoting an idea/trend, or producing AI-explainer content that helps people
evaluate news claims critically.

The repo is meant to be **forked per campaign**: same core engine, different
persona(s), different message, different platform mix.

## Scope decided so far

- **In scope:** content creation (video/image/text) under one or more branded
  virtual-persona channels, multi-platform publishing, and *disclosed*
  reply/engagement — i.e. the persona's own channel replying to comments/DMs
  on its own posts as itself.
- **Out of scope:** covert engagement — personas designed to pass as
  independent, organic human users inside other people's threads/discussions
  (Reddit, HN, forums, etc.), or fleets of undisclosed sockpuppet identities.
  The deception mechanism (people believing they're talking to an
  independent peer) is the problem regardless of payload — product hype,
  anti-misinformation content, or anything else. This holds even for
  well-intentioned counter-misinformation use cases; covert "counter-disinfo"
  persona networks have backfired before because the deception itself becomes
  the story once discovered.

## Open questions

### Personas & identity
1. How many personas run concurrently — one per campaign/fork, or several per
   fork?
2. Does each persona need a consistent identity across platforms (name,
   avatar, voice, bio) or can identity vary by platform?
3. How is AI/virtual status disclosed per persona (bio text, platform AI-label
   features, watermark, intro disclaimer in videos)?

### Platforms
4. Which platforms are in scope for v1? (YouTube, Instagram, TikTok, X,
   Threads, Facebook, LinkedIn, WhatsApp Business...)
5. For WhatsApp specifically: what's the actual use case — broadcast to an
   opted-in subscriber list, or Business API customer replies? (Cold/bulk
   outreach to non-opted-in numbers is out of scope regardless — spam and
   ToS/legal issues.)

### Content
6. What content types: talking-head avatar video, voiceover + b-roll,
   short-form vertical video, image/carousel posts, text posts/threads,
   long-form scripts?
7. Preferred/available tools — avatar video (e.g. HeyGen/Synthesia-style),
   voice (e.g. ElevenLabs), image gen, LLM for scripts — or is tool selection
   part of this planning?
8. For the fact-check/explainer persona: how are topics sourced — manual
   input, automated trending-news monitoring, or both?

### Workflow & guardrails
9. Human-in-the-loop: does every piece of content get human review/approval
   before it publishes, or is any part of the pipeline fully autonomous?
10. Reply/engagement automation: AI-generated live replies, templated
    replies, or human-reviewed queue? Any escalation path for sensitive
    replies?

### Success metrics
11. What defines success per campaign — views, engagement rate, conversions,
    sentiment shift, something else? Need a dashboard?

### Infra & accounts
12. Do you already have creator/business API access set up (YouTube Data API,
    Meta Graph API, TikTok API, X API, WhatsApp Business API), or does that
    need to happen first? Note some of these are paid/rate-limited.
13. Tech stack preferences (language, framework, hosting) or is this
    greenfield?
14. Who operates this day-to-day — just you, or a team? Multi-user/roles
    needed?

### Repo structure
15. Should "fork per campaign" mean: a template repo you clone per campaign,
    or one core repo with a plugin/config layer per campaign (monorepo with
    packages like `core/`, `campaigns/product-x/`, `campaigns/factcheck/`)?
