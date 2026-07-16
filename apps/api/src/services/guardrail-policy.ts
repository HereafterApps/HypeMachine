import { runGuardrails, type GuardrailPolicy } from '@hype/guardrails';
import type { CampaignPlugType, GuardrailResult } from '@hype/core';
import type { Campaign, GeneratedContent, GuardrailConfig, Platform } from '@hype/db';

export function buildPolicyFromCampaign(
  campaign: Campaign & { guardrailConfig: GuardrailConfig | null },
): GuardrailPolicy {
  const config = campaign.guardrailConfig;
  const competitorRules = (config?.competitorRules ?? {}) as {
    allowCompetitorMentions?: boolean;
    names?: string[];
  };
  return {
    allowedTopics: config?.allowedTopics ?? [],
    bannedTopics: config?.bannedTopics ?? [],
    allowedClaims: config?.allowedClaims ?? [],
    bannedClaims: config?.bannedClaims ?? [],
    requiredDisclosures: config?.requiredDisclosures ?? [],
    wordsToAvoid: config?.wordsToAvoid ?? [],
    allowCompetitorMentions: competitorRules.allowCompetitorMentions ?? false,
    competitorNames: competitorRules.names ?? [],
    directnessLevel: campaign.directnessLevel,
  };
}

export function evaluateContentFields(
  policy: GuardrailPolicy,
  input: {
    platform: Platform;
    title?: string | null;
    hook?: string | null;
    script?: string | null;
    caption?: string | null;
    bodyText?: string | null;
    cta?: string | null;
    hashtags: string[];
    campaignPlugType?: CampaignPlugType;
    riskNotes?: string[];
    recentTexts?: string[];
  },
): GuardrailResult {
  return runGuardrails(policy, {
    platform: input.platform,
    texts: [
      { label: 'title', value: input.title ?? '' },
      { label: 'hook', value: input.hook ?? '' },
      { label: 'script', value: input.script ?? '' },
      { label: 'caption', value: input.caption ?? '' },
      { label: 'body', value: input.bodyText ?? '' },
      { label: 'cta', value: input.cta ?? '' },
    ].filter((t) => t.value),
    hashtags: input.hashtags,
    campaignPlugType: input.campaignPlugType ?? 'NONE',
    riskNotes: input.riskNotes ?? [],
    recentTexts: input.recentTexts ?? [],
  });
}

export function contentPlugType(content: GeneratedContent): CampaignPlugType {
  const guardrail = content.guardrailResult as { plugType?: CampaignPlugType } | null;
  const meta = content.generationMetadata as { plugType?: CampaignPlugType } | null;
  return guardrail?.plugType ?? meta?.plugType ?? (content.cta ? 'CASUAL' : 'NONE');
}
