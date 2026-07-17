import type { CampaignPlugType } from '@hype/core';
import type { Campaign, GeneratedContent, GuardrailConfig } from '@hype/db';

/**
 * Policy payload sent to the pipeline service, which owns the guardrail
 * engine (apps/pipeline/hype_pipeline/guardrails.py).
 */
export interface GuardrailPolicy {
  campaignType: string;
  allowedTopics: string[];
  bannedTopics: string[];
  allowedClaims: string[];
  bannedClaims: string[];
  requiredDisclosures: string[];
  wordsToAvoid: string[];
  allowCompetitorMentions: boolean;
  competitorNames: string[];
  directnessLevel: string;
}

export function buildPolicyFromCampaign(
  campaign: Campaign & { guardrailConfig: GuardrailConfig | null },
): GuardrailPolicy {
  const config = campaign.guardrailConfig;
  const competitorRules = (config?.competitorRules ?? {}) as {
    allowCompetitorMentions?: boolean;
    names?: string[];
  };
  return {
    campaignType: campaign.campaignType,
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

export function contentPlugType(content: GeneratedContent): CampaignPlugType {
  const guardrail = content.guardrailResult as { plugType?: CampaignPlugType } | null;
  const meta = content.generationMetadata as { plugType?: CampaignPlugType } | null;
  return guardrail?.plugType ?? meta?.plugType ?? (content.cta ? 'CASUAL' : 'NONE');
}
