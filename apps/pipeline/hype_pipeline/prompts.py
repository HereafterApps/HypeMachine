"""Prompt builders — port of the original packages/ai builders.

The pipeline service is now the single source of truth for these; keep
wording stable because the operator-facing prompt is stored on each
GeneratedContent row and tests assert on key phrases.
"""
from __future__ import annotations

from .schemas import CampaignContext, PersonaContext

OUTPUT_KIND_MARKER = "## Output kind:"

PLATFORM_CONVENTIONS: dict[str, str] = {
    "YOUTUBE": (
        "YouTube Shorts: vertical 9:16, 20–45s, strong 1–2 second hook, captions on, "
        "max ~100-char title. Mark as AI/synthetic content per YouTube disclosure tools."
    ),
    "X": (
        "X: max 280 chars per post, punchy first line, at most 1–2 hashtags, links "
        "allowed. Conversational, a little spicy is fine."
    ),
    "TIKTOK": (
        "TikTok: vertical 9:16, fast cuts, native text overlays, trending-sound friendly. "
        "Use AI-generated content label."
    ),
    "INSTAGRAM": (
        "Instagram Reels: vertical 9:16, caption up to 2200 chars but front-load first 125, "
        "3–5 hashtags."
    ),
    "LINKEDIN": (
        "LinkedIn: professional but personal, short paragraphs, no more than 3 hashtags, "
        "no engagement bait."
    ),
    "MANUAL_EXPORT": (
        "Manual export bundle: platform-neutral formatting; operator will adapt per platform."
    ),
}

CAMPAIGN_TYPE_RULES: dict[str, str] = {
    "DEBUNK": "\n".join(
        [
            "DEBUNK rules (non-negotiable):",
            '- Address ONE specific claim. End at "is this specific claim accurate?".',
            "- NEVER conclude with support/oppose/vote/which-side-is-right — that is advocacy and is blocked.",
            "- Target the claim, never a person's character or a party.",
            "- Cite at least one primary source in sourceCitations (URL or precise reference).",
            "- The correction must be verifiable: someone who dislikes the conclusion should still agree the correction itself is factually accurate.",
        ]
    ),
    "CIVIC_MECHANICS": "\n".join(
        [
            "CIVIC_MECHANICS rules (non-negotiable):",
            "- Explain how a civic process works (e.g. how ranked-choice voting counts ballots).",
            "- Strictly neutral: no advocacy for any candidate, party, side, or outcome.",
            "- Prefer citing official/primary sources in sourceCitations.",
        ]
    ),
    "MEDIA_LITERACY": "\n".join(
        [
            "MEDIA_LITERACY rules:",
            "- Teach evaluation skills; never tell the audience what to believe about a contested political question.",
        ]
    ),
}


def build_persona_context(persona: PersonaContext) -> str:
    memories = "\n".join(f"- [{m['type']}] {m['content']}" for m in persona.memoryHighlights)
    parts = [
        "# Persona",
        f"Name: {persona.name}",
        f"Backstory: {persona.backstory}",
        f"Worldview: {persona.worldview}",
        f"Speaking style: {persona.speakingStyle}",
        f"Tone: {persona.tone}",
        f"Humor: {persona.humorStyle}",
        (
            f'Disclosure: this persona is openly virtual/AI-driven ("{persona.disclosureText}"). '
            "Never pretend to be a real human being; never deny being an AI persona if asked."
        ),
        f"Memory highlights:\n{memories}" if memories else "",
    ]
    return "\n".join(p for p in parts if p)


def build_system_prompt(persona: PersonaContext) -> str:
    return "\n".join(
        [
            'You are the content engine for a disclosed virtual creator ("persona"). You write content that the',
            "persona will publish on its own channels. Rules that always apply:",
            "- The persona is openly AI/virtual. Content must never claim or imply it is a real human.",
            "- Content is published only on the persona's own channels; it never poses as an independent user elsewhere.",
            "- Stay inside the campaign's allowed claims; never state banned claims even indirectly.",
            "- Every piece of content goes through human approval before publishing — flag anything risky in riskNotes.",
            "",
            build_persona_context(persona),
        ]
    )


def build_campaign_context(
    campaign: CampaignContext,
    allowed_claims: list[str],
    banned_claims: list[str],
    banned_topics: list[str],
) -> str:
    if campaign.plugFrequency == "CUSTOM_PERCENTAGE":
        plug = f"{campaign.plugPercentage if campaign.plugPercentage is not None else 50}% of posts mention the product"
    else:
        plug = campaign.plugFrequency
    sources = "\n".join(
        f"- [{s.type}] {s.title}: {s.content[:500]}" for s in campaign.sources
    )
    learnings = "\n".join(f"- {l}" for l in campaign.learnings)
    parts = [
        "# Campaign",
        f"Name: {campaign.name}",
        f"Type: {campaign.campaignType}",
        f"Goal: {campaign.objective}",
        f"Subject: {campaign.subject}" if campaign.subject else "",
        CAMPAIGN_TYPE_RULES.get(campaign.campaignType, ""),
        (
            f"Product: {campaign.productName} — {campaign.productDescription or ''}"
            if campaign.productName
            else ""
        ),
        f"URL: {campaign.productUrl}" if campaign.productUrl else "",
        f"Target audience: {campaign.targetAudience}" if campaign.targetAudience else "",
        f"Directness level: {campaign.directnessLevel}",
        f"Plug frequency: {plug}",
        f"Main message: {campaign.mainMessage}" if campaign.mainMessage else "",
        f"Product mention style: {campaign.productLine}" if campaign.productLine else "",
        (
            "Allowed claims (stay inside these):\n" + "\n".join(f"- {c}" for c in allowed_claims)
            if allowed_claims
            else ""
        ),
        (
            "Banned claims (never state or imply):\n" + "\n".join(f"- {c}" for c in banned_claims)
            if banned_claims
            else ""
        ),
        ("Banned topics:\n" + "\n".join(f"- {t}" for t in banned_topics) if banned_topics else ""),
        f"Source material:\n{sources}" if sources else "",
        f"Recent performance learnings (adapt to these):\n{learnings}" if learnings else "",
    ]
    return "\n".join(p for p in parts if p)


def build_platform_context(platform: str, content_type: str) -> str:
    return "\n".join(
        [
            "# Platform",
            f"Platform: {platform}",
            f"Content format: {content_type}",
            PLATFORM_CONVENTIONS.get(platform, "Follow general social-media best practices."),
        ]
    )


def build_generation_prompt(
    *,
    campaign_context: str,
    platform_context: str,
    output_kind: str,
    include_plug: bool | None,
    extra_instructions: str | None,
    recent_summaries: list[str],
) -> str:
    recent = "\n".join(f"- {s}" for s in recent_summaries if s)
    plug_line = (
        "For THIS piece: do NOT plug the product. Pure value/personality content (campaignPlugType must be NONE)."
        if include_plug is False
        else "For THIS piece: include the campaign plug at the configured directness level."
    )
    parts = [
        campaign_context,
        "",
        platform_context,
        "",
        f"# Recent content (do not duplicate these):\n{recent}\n" if recent else "",
        plug_line,
        f"# Extra instructions\n{extra_instructions}" if extra_instructions else "",
        "",
        f"{OUTPUT_KIND_MARKER} {output_kind}",
        "Respond with a single JSON object matching the requested schema.",
    ]
    return "\n".join(p for p in parts if p)
