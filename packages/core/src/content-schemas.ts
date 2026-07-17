import { z } from 'zod';
import { BROLL_SOURCES, CAMPAIGN_PLUG_TYPES, RISK_LEVELS } from './enums.js';

/**
 * Structured LLM output schemas (product-plan §8). Every generation call
 * must validate against one of these — invalid JSON from a provider is a
 * retryable error, never silently accepted.
 */

export const BrollShotSchema = z.object({
  timestamp: z
    .string()
    .regex(/^\d+:\d{2}-\d+:\d{2}$/, 'expected "M:SS-M:SS"'),
  description: z.string().min(1),
  source: z.enum(BROLL_SOURCES),
});
export type BrollShot = z.infer<typeof BrollShotSchema>;

export const ShortVideoPlanSchema = z.object({
  title: z.string().min(1).max(120),
  hook: z.string().min(1),
  script: z.string().min(1),
  caption: z.string().min(1),
  hashtags: z.array(z.string().min(1)).max(15),
  cta: z.string(),
  visualDirection: z.string(),
  cameraStyle: z.string(),
  outfitSuggestion: z.string(),
  brollPlan: z.array(BrollShotSchema),
  thumbnailIdea: z.string(),
  campaignPlugType: z.enum(CAMPAIGN_PLUG_TYPES),
  whyThisShouldWork: z.string(),
  riskNotes: z.array(z.string()),
  /** Primary sources. Required non-empty for DEBUNK campaigns (build-spec §2.6). */
  sourceCitations: z.array(z.string()),
});
export type ShortVideoPlan = z.infer<typeof ShortVideoPlanSchema>;

export const TextPostPlanSchema = z.object({
  body: z.string().min(1),
  hook: z.string().min(1),
  cta: z.string(),
  hashtags: z.array(z.string().min(1)).max(15),
  campaignPlugType: z.enum(CAMPAIGN_PLUG_TYPES),
  whyThisShouldWork: z.string(),
  riskNotes: z.array(z.string()),
  /** Primary sources. Required non-empty for DEBUNK campaigns (build-spec §2.6). */
  sourceCitations: z.array(z.string()),
});
export type TextPostPlan = z.infer<typeof TextPostPlanSchema>;

/** Replies happen on the persona's own posts/DMs only (§0.1). */
export const ReplyPlanSchema = z.object({
  reply: z.string().min(1),
  tone: z.string(),
  shouldMentionCampaign: z.boolean(),
  campaignMention: z.string(),
  riskLevel: z.enum(RISK_LEVELS),
  escalateToHuman: z.boolean(),
  reason: z.string(),
});
export type ReplyPlan = z.infer<typeof ReplyPlanSchema>;

export const LearningInsightPlanSchema = z.object({
  insight: z.string().min(1),
  evidence: z.string().min(1),
  confidence: z.number().min(0).max(1),
  actionRecommendation: z.string().min(1),
});
export type LearningInsightPlan = z.infer<typeof LearningInsightPlanSchema>;
