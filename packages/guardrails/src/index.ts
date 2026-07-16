import {
  riskLevelFromScore,
  type CampaignPlugType,
  type DirectnessLevel,
  type GuardrailChecklistItem,
  type GuardrailResult,
  type Platform,
} from '@hype/core';

export interface GuardrailPolicy {
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
  /** Summaries of recent content for duplicate detection. */
  recentTexts: string[];
}

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
