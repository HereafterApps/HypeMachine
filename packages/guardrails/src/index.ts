import {
  riskLevelFromScore,
  type CampaignPlugType,
  type DirectnessLevel,
  type GuardrailChecklistItem,
  type GuardrailResult,
  type Platform,
} from '@hype/core';

export interface GuardrailPolicy {
  /** Drives the political-content checks (build-spec §2.6). */
  campaignType: string;
  allowedTopics: string[];
  bannedTopics: string[];
  allowedClaims: string[];
  bannedClaims: string[];
  requiredDisclosures: string[];
  wordsToAvoid: string[];
  allowCompetitorMentions: boolean;
  competitorNames: string[];
  directnessLevel: DirectnessLevel;
}

export interface ContentUnderReview {
  platform: Platform;
  /** All human-visible text: title, hook, script, caption, body, cta. */
  texts: { label: string; value: string }[];
  hashtags: string[];
  campaignPlugType?: CampaignPlugType;
  riskNotes: string[];
  /** Primary sources cited by the content (required for DEBUNK). */
  sourceCitations: string[];
  /** Summaries of recent content for duplicate detection. */
  recentTexts: string[];
}

/** Campaign types subject to the §2.6 political-content policy. */
const POLITICAL_MISSION_TYPES = new Set(['DEBUNK', 'CIVIC_MECHANICS', 'MEDIA_LITERACY']);

/**
 * Enforceable test A (build-spec §2.6): content must end at "is this claim
 * accurate?" — the moment it says "…therefore support / oppose / vote /
 * which side is right", it is advocacy. These patterns are the deterministic
 * floor; the human reviewer applies tests A & B in full at approval time.
 */
const ADVOCACY_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bvote\s+(for|against|no\s+on|yes\s+on)\b/i, label: 'voting instruction' },
  { pattern: /\b(re-?elect|unseat|defeat)\b/i, label: 'electoral persuasion' },
  { pattern: /\byou\s+should\s+(support|oppose|back)\b/i, label: 'support/oppose directive' },
  { pattern: /\b(support|oppose|back|reject)\s+(the\s+)?(candidate|party|bill|ballot|measure|proposition|amendment)\b/i, label: 'candidate/party/measure persuasion' },
  { pattern: /\bdonate\s+to\s+(the\s+)?(campaign|candidate|party)\b/i, label: 'political fundraising' },
  { pattern: /\bwhich\s+side\s+is\s+right\b/i, label: 'side-taking' },
  { pattern: /\bthe\s+(right|correct)\s+side\s+of\s+(history|this)\b/i, label: 'side-taking' },
];

const PLATFORM_TEXT_LIMITS: Partial<Record<Platform, number>> = {
  X: 280,
};

const DIRECTNESS_RANK: Record<DirectnessLevel, number> = {
  VERY_SUBTLE: 0,
  SUBTLE: 1,
  CASUAL: 2,
  DIRECT: 3,
  HARD_CTA: 4,
};

const PLUG_RANK: Record<CampaignPlugType, number> = {
  NONE: -1,
  SUBTLE: 1,
  CASUAL: 2,
  DIRECT: 3,
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return normalize(haystack).includes(normalize(phrase));
}

/** Jaccard similarity over word trigrams — cheap duplicate detection. */
export function textSimilarity(a: string, b: string): number {
  const grams = (t: string) => {
    const words = normalize(t).split(' ');
    const set = new Set<string>();
    for (let i = 0; i < words.length - 2; i++) {
      set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let intersection = 0;
  for (const g of ga) if (gb.has(g)) intersection++;
  return intersection / (ga.size + gb.size - intersection);
}

/**
 * Deterministic policy checks (product-plan §7.9). Blockers stop the content
 * from being approvable until edited; warnings surface in the checklist and
 * can be overridden by the human reviewer (§19).
 */
export function runGuardrails(
  policy: GuardrailPolicy,
  content: ContentUnderReview,
): GuardrailResult {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const requiredEdits: string[] = [];
  const checklist: GuardrailChecklistItem[] = [];
  let riskScore = 0;

  const allText = content.texts.map((t) => t.value).join('\n');
  const isPoliticalMission = POLITICAL_MISSION_TYPES.has(policy.campaignType);

  // 0a. Political-content policy (build-spec §2.6) — advocacy is a blocker
  // for mission campaign types (rungs 1–2 only; no advocacy, ever).
  if (isPoliticalMission) {
    const advocacyHits = ADVOCACY_PATTERNS.filter((p) => p.pattern.test(allText));
    if (advocacyHits.length) {
      blockers.push(
        `Political advocacy detected (${advocacyHits.map((h) => h.label).join(', ')}): content must end at "is this claim accurate?" — never "…therefore support/oppose/vote".`,
      );
      requiredEdits.push('Remove all advocacy; restate as a pure factual correction or explanation.');
      riskScore += 70;
    }
    checklist.push({
      label: 'No political advocacy (rungs 1–2 only)',
      passed: advocacyHits.length === 0,
      detail: advocacyHits.map((h) => h.label).join(', ') || undefined,
    });
    // Tests A & B and "claims, not people" need human judgment — surface as
    // a standing reviewer reminder, not an auto-pass.
    warnings.push(
      'Reviewer must confirm (§2.6): the piece targets a specific claim (not a person/party), and someone who dislikes the conclusion could still agree the correction itself is factually accurate.',
    );
  }

  // 0b. DEBUNK requires a citable primary source — blocker.
  if (policy.campaignType === 'DEBUNK') {
    const hasCitations = content.sourceCitations.length > 0;
    if (!hasCitations) {
      blockers.push('DEBUNK content requires at least one citable primary source.');
      requiredEdits.push('Add the primary source(s) that verify the correction.');
      riskScore += 40;
    }
    checklist.push({
      label: 'Primary source cited (DEBUNK)',
      passed: hasCitations,
      detail: hasCitations ? content.sourceCitations.join('; ') : undefined,
    });
  }

  // 1. Banned claims — blocker.
  const bannedClaimHits = policy.bannedClaims.filter((claim) =>
    containsPhrase(allText, claim),
  );
  if (bannedClaimHits.length) {
    blockers.push(`Contains banned claim(s): ${bannedClaimHits.join('; ')}`);
    requiredEdits.push('Remove or rephrase the banned claims.');
    riskScore += 60;
  }
  checklist.push({
    label: 'Banned claims avoided',
    passed: bannedClaimHits.length === 0,
    detail: bannedClaimHits.join('; ') || undefined,
  });

  // 2. Banned topics — blocker.
  const bannedTopicHits = policy.bannedTopics.filter((topic) =>
    containsPhrase(allText, topic),
  );
  if (bannedTopicHits.length) {
    blockers.push(`Touches banned topic(s): ${bannedTopicHits.join('; ')}`);
    requiredEdits.push('Drop the banned topics.');
    riskScore += 40;
  }
  checklist.push({
    label: 'Banned topics avoided',
    passed: bannedTopicHits.length === 0,
    detail: bannedTopicHits.join('; ') || undefined,
  });

  // 3. Words/phrases to avoid — warning.
  const avoidHits = policy.wordsToAvoid.filter((w) => containsPhrase(allText, w));
  if (avoidHits.length) {
    warnings.push(`Uses discouraged wording: ${avoidHits.join(', ')}`);
    riskScore += 10;
  }
  checklist.push({
    label: 'Discouraged wording avoided',
    passed: avoidHits.length === 0,
    detail: avoidHits.join(', ') || undefined,
  });

  // 4. Competitor mentions — warning or blocker per policy.
  const competitorHits = policy.competitorNames.filter((c) =>
    containsPhrase(allText, c),
  );
  if (competitorHits.length && !policy.allowCompetitorMentions) {
    blockers.push(`Mentions competitor(s): ${competitorHits.join(', ')}`);
    requiredEdits.push('Remove competitor mentions.');
    riskScore += 30;
  }
  checklist.push({
    label: 'Competitor rules respected',
    passed: competitorHits.length === 0 || policy.allowCompetitorMentions,
    detail: competitorHits.join(', ') || undefined,
  });

  // 5. Plug directness vs campaign setting — warning.
  const plug = content.campaignPlugType ?? 'NONE';
  const tooDirect =
    plug !== 'NONE' && PLUG_RANK[plug] > DIRECTNESS_RANK[policy.directnessLevel];
  if (tooDirect) {
    warnings.push(
      `Plug (${plug}) is more direct than campaign directness (${policy.directnessLevel}).`,
    );
    riskScore += 10;
  }
  checklist.push({
    label: 'CTA matches campaign directness',
    passed: !tooDirect,
  });

  // 6. Platform length limits — blocker (unpublishable as-is).
  const limit = PLATFORM_TEXT_LIMITS[content.platform];
  let lengthOk = true;
  if (limit) {
    const body = content.texts.find((t) => t.label === 'body')?.value ?? '';
    const withTags = [body, ...content.hashtags].join(' ');
    if (withTags.length > limit) {
      lengthOk = false;
      blockers.push(
        `Text (${withTags.length} chars incl. hashtags) exceeds ${content.platform} limit of ${limit}.`,
      );
      requiredEdits.push(`Shorten the post to at most ${limit} characters.`);
      riskScore += 20;
    }
  }
  checklist.push({ label: 'Platform compatible', passed: lengthOk });

  // 7. Duplicate of recent content — warning.
  const duplicateOf = content.recentTexts.find(
    (recent) => textSimilarity(allText, recent) > 0.6,
  );
  if (duplicateOf) {
    warnings.push('Very similar to a recent post — likely duplicate.');
    riskScore += 15;
  }
  checklist.push({ label: 'No duplicate of recent post', passed: !duplicateOf });

  // 8. Model-flagged risk notes — warning.
  if (content.riskNotes.length) {
    warnings.push(`Model flagged: ${content.riskNotes.join('; ')}`);
    riskScore += Math.min(15, content.riskNotes.length * 5);
  }
  checklist.push({
    label: 'No model-flagged risks',
    passed: content.riskNotes.length === 0,
    detail: content.riskNotes.join('; ') || undefined,
  });

  riskScore = Math.min(100, riskScore);
  return {
    passed: blockers.length === 0,
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    warnings,
    blockers,
    requiredEdits,
    checklist,
  };
}
