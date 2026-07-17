"""Deterministic guardrail engine — port of packages/guardrails.

Single source of truth since the hybrid split (build-spec §4.1): the TS API
calls this service for every check. Blocker/warning wording is part of the
contract — the TS layer maps some phrases to HTTP 409s and tests assert on
them, so change wording deliberately.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .schemas import ChecklistItem, GuardrailPolicy, GuardrailResult

PLATFORM_TEXT_LIMITS: dict[str, int] = {"X": 280}

DIRECTNESS_RANK = {"VERY_SUBTLE": 0, "SUBTLE": 1, "CASUAL": 2, "DIRECT": 3, "HARD_CTA": 4}
PLUG_RANK = {"NONE": -1, "SUBTLE": 1, "CASUAL": 2, "DIRECT": 3}

POLITICAL_MISSION_TYPES = {"DEBUNK", "CIVIC_MECHANICS", "MEDIA_LITERACY"}


@dataclass(frozen=True)
class AdvocacyPattern:
    pattern: re.Pattern
    label: str


ADVOCACY_PATTERNS = [
    AdvocacyPattern(re.compile(r"\bvote\s+(for|against|no\s+on|yes\s+on)\b", re.I), "voting instruction"),
    AdvocacyPattern(re.compile(r"\b(re-?elect|unseat|defeat)\b", re.I), "electoral persuasion"),
    AdvocacyPattern(re.compile(r"\byou\s+should\s+(support|oppose|back)\b", re.I), "support/oppose directive"),
    AdvocacyPattern(
        re.compile(
            r"\b(support|oppose|back|reject)\s+(the\s+)?(candidate|party|bill|ballot|measure|proposition|amendment)\b",
            re.I,
        ),
        "candidate/party/measure persuasion",
    ),
    AdvocacyPattern(re.compile(r"\bdonate\s+to\s+(the\s+)?(campaign|candidate|party)\b", re.I), "political fundraising"),
    AdvocacyPattern(re.compile(r"\bwhich\s+side\s+is\s+right\b", re.I), "side-taking"),
    AdvocacyPattern(re.compile(r"\bthe\s+(right|correct)\s+side\s+of\s+(history|this)\b", re.I), "side-taking"),
]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _contains_phrase(haystack: str, phrase: str) -> bool:
    return _normalize(phrase) in _normalize(haystack)


def text_similarity(a: str, b: str) -> float:
    """Jaccard similarity over word trigrams — cheap duplicate detection."""

    def grams(t: str) -> set[str]:
        words = _normalize(t).split(" ")
        return {" ".join(words[i : i + 3]) for i in range(len(words) - 2)}

    ga, gb = grams(a), grams(b)
    if not ga or not gb:
        return 0.0
    intersection = len(ga & gb)
    return intersection / (len(ga) + len(gb) - intersection)


def risk_level_from_score(score: int) -> str:
    if score >= 60:
        return "HIGH"
    if score >= 30:
        return "MEDIUM"
    return "LOW"


def run_guardrails(
    policy: GuardrailPolicy,
    *,
    platform: str,
    texts: list[tuple[str, str]],
    hashtags: list[str],
    campaign_plug_type: str,
    risk_notes: list[str],
    source_citations: list[str],
    recent_texts: list[str],
) -> GuardrailResult:
    warnings: list[str] = []
    blockers: list[str] = []
    required_edits: list[str] = []
    checklist: list[ChecklistItem] = []
    risk_score = 0

    texts = [(label, value) for label, value in texts if value]
    all_text = "\n".join(value for _, value in texts)
    is_political_mission = policy.campaignType in POLITICAL_MISSION_TYPES

    # 0a. Political-content policy (build-spec §2.6).
    if is_political_mission:
        advocacy_hits = [p for p in ADVOCACY_PATTERNS if p.pattern.search(all_text)]
        if advocacy_hits:
            labels = ", ".join(h.label for h in advocacy_hits)
            blockers.append(
                f"Political advocacy detected ({labels}): content must end at \"is this claim "
                'accurate?" — never "…therefore support/oppose/vote".'
            )
            required_edits.append(
                "Remove all advocacy; restate as a pure factual correction or explanation."
            )
            risk_score += 70
        checklist.append(
            ChecklistItem(
                label="No political advocacy (rungs 1–2 only)",
                passed=not advocacy_hits,
                detail=", ".join(h.label for h in advocacy_hits) or None,
            )
        )
        warnings.append(
            "Reviewer must confirm (§2.6): the piece targets a specific claim (not a "
            "person/party), and someone who dislikes the conclusion could still agree the "
            "correction itself is factually accurate."
        )

    # 0b. DEBUNK requires a citable primary source.
    if policy.campaignType == "DEBUNK":
        has_citations = len(source_citations) > 0
        if not has_citations:
            blockers.append("DEBUNK content requires at least one citable primary source.")
            required_edits.append("Add the primary source(s) that verify the correction.")
            risk_score += 40
        checklist.append(
            ChecklistItem(
                label="Primary source cited (DEBUNK)",
                passed=has_citations,
                detail="; ".join(source_citations) or None,
            )
        )

    # 1. Banned claims — blocker.
    banned_claim_hits = [c for c in policy.bannedClaims if _contains_phrase(all_text, c)]
    if banned_claim_hits:
        blockers.append(f"Contains banned claim(s): {'; '.join(banned_claim_hits)}")
        required_edits.append("Remove or rephrase the banned claims.")
        risk_score += 60
    checklist.append(
        ChecklistItem(
            label="Banned claims avoided",
            passed=not banned_claim_hits,
            detail="; ".join(banned_claim_hits) or None,
        )
    )

    # 2. Banned topics — blocker.
    banned_topic_hits = [t for t in policy.bannedTopics if _contains_phrase(all_text, t)]
    if banned_topic_hits:
        blockers.append(f"Touches banned topic(s): {'; '.join(banned_topic_hits)}")
        required_edits.append("Drop the banned topics.")
        risk_score += 40
    checklist.append(
        ChecklistItem(
            label="Banned topics avoided",
            passed=not banned_topic_hits,
            detail="; ".join(banned_topic_hits) or None,
        )
    )

    # 3. Words/phrases to avoid — warning.
    avoid_hits = [w for w in policy.wordsToAvoid if _contains_phrase(all_text, w)]
    if avoid_hits:
        warnings.append(f"Uses discouraged wording: {', '.join(avoid_hits)}")
        risk_score += 10
    checklist.append(
        ChecklistItem(
            label="Discouraged wording avoided",
            passed=not avoid_hits,
            detail=", ".join(avoid_hits) or None,
        )
    )

    # 4. Competitor mentions — blocker unless allowed.
    competitor_hits = [c for c in policy.competitorNames if _contains_phrase(all_text, c)]
    if competitor_hits and not policy.allowCompetitorMentions:
        blockers.append(f"Mentions competitor(s): {', '.join(competitor_hits)}")
        required_edits.append("Remove competitor mentions.")
        risk_score += 30
    checklist.append(
        ChecklistItem(
            label="Competitor rules respected",
            passed=not competitor_hits or policy.allowCompetitorMentions,
            detail=", ".join(competitor_hits) or None,
        )
    )

    # 5. Plug directness vs campaign setting — warning.
    too_direct = (
        campaign_plug_type != "NONE"
        and PLUG_RANK.get(campaign_plug_type, -1)
        > DIRECTNESS_RANK.get(policy.directnessLevel, 2)
    )
    if too_direct:
        warnings.append(
            f"Plug ({campaign_plug_type}) is more direct than campaign directness "
            f"({policy.directnessLevel})."
        )
        risk_score += 10
    checklist.append(ChecklistItem(label="CTA matches campaign directness", passed=not too_direct))

    # 6. Platform length limits — blocker.
    limit = PLATFORM_TEXT_LIMITS.get(platform)
    length_ok = True
    if limit:
        body = next((value for label, value in texts if label == "body"), "")
        with_tags = " ".join([body, *hashtags]).strip()
        if len(with_tags) > limit:
            length_ok = False
            blockers.append(
                f"Text ({len(with_tags)} chars incl. hashtags) exceeds {platform} limit of {limit}."
            )
            required_edits.append(f"Shorten the post to at most {limit} characters.")
            risk_score += 20
    checklist.append(ChecklistItem(label="Platform compatible", passed=length_ok))

    # 7. Duplicate of recent content — warning.
    duplicate = any(text_similarity(all_text, recent) > 0.6 for recent in recent_texts)
    if duplicate:
        warnings.append("Very similar to a recent post — likely duplicate.")
        risk_score += 15
    checklist.append(ChecklistItem(label="No duplicate of recent post", passed=not duplicate))

    # 8. Model-flagged risk notes — warning.
    if risk_notes:
        warnings.append(f"Model flagged: {'; '.join(risk_notes)}")
        risk_score += min(15, len(risk_notes) * 5)
    checklist.append(
        ChecklistItem(
            label="No model-flagged risks",
            passed=not risk_notes,
            detail="; ".join(risk_notes) or None,
        )
    )

    risk_score = min(100, risk_score)
    return GuardrailResult(
        passed=not blockers,
        riskScore=risk_score,
        riskLevel=risk_level_from_score(risk_score),  # type: ignore[arg-type]
        warnings=warnings,
        blockers=blockers,
        requiredEdits=required_edits,
        checklist=checklist,
    )
