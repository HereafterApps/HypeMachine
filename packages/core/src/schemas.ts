import { z } from "zod";
import {
  AGGRESSION_LEVELS,
  APPROVAL_ACTIONS,
  ASSET_TYPES,
  BROLL_SOURCES,
  CAMERA_STYLES,
  CAMPAIGN_SOURCE_TYPES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  CONTENT_TYPES,
  DIRECTNESS_LEVELS,
  MEMORY_TYPES,
  PERSONA_STATUSES,
  PERSONA_TYPES,
  PLATFORMS,
  PLUG_FREQUENCIES,
  PLUG_TYPES,
  RISK_LEVELS,
} from "./enums.js";

// ---------------------------------------------------------------------------
// API input schemas
// ---------------------------------------------------------------------------

export const personaCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  personaType: z.enum(PERSONA_TYPES).default("CUSTOM"),
  status: z.enum(PERSONA_STATUSES).default("ACTIVE"),
  description: z.string().max(2000).default(""),
  backstory: z.string().max(20000).default(""),
  worldview: z.string().max(5000).default(""),
  speakingStyle: z.string().max(5000).default(""),
  tone: z.string().max(1000).default(""),
  humorStyle: z.string().max(1000).default(""),
  // Required: every persona must carry disclosure language (§0.1).
  disclosureText: z.string().min(1).max(1000),
  defaultLanguage: z.string().max(20).default("en"),
  defaultPlatformTone: z.string().max(2000).default(""),
  memoryEnabled: z.boolean().default(true),
});
export type PersonaCreateInput = z.infer<typeof personaCreateSchema>;

export const personaUpdateSchema = personaCreateSchema.partial();

export const personaMemoryCreateSchema = z.object({
  type: z.enum(MEMORY_TYPES),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(20000),
  importance: z.number().min(0).max(1).default(0.5),
  source: z.string().max(300).default("manual"),
});

export const personaAssetCreateSchema = z.object({
  type: z.enum(ASSET_TYPES),
  name: z.string().min(1).max(300),
  url: z.string().url(),
  s3Key: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  isDefault: z.boolean().default(false),
});

export const campaignCreateSchema = z.object({
  personaId: z.string().min(1),
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  status: z.enum(CAMPAIGN_STATUSES).default("ACTIVE"),
  campaignType: z.enum(CAMPAIGN_TYPES).default("CUSTOM"),
  objective: z.string().max(5000).default(""),
  targetAudience: z.string().max(2000).default(""),
  productName: z.string().max(300).default(""),
  productDescription: z.string().max(10000).default(""),
  productUrl: z.string().url().optional(),
  directnessLevel: z.enum(DIRECTNESS_LEVELS).default("CASUAL"),
  plugFrequency: z.enum(PLUG_FREQUENCIES).default("WHEN_NATURAL"),
  plugPercentage: z.number().int().min(0).max(100).optional(),
  primaryKpi: z.string().max(100).default("VIEWS"),
  secondaryKpis: z.array(z.string().max(100)).default([]),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;

export const campaignUpdateSchema = campaignCreateSchema
  .omit({ personaId: true })
  .partial();

export const campaignSourceCreateSchema = z.object({
  type: z.enum(CAMPAIGN_SOURCE_TYPES),
  title: z.string().min(1).max(300),
  content: z.string().max(100000).default(""),
  url: z.string().url().optional(),
  fileUrl: z.string().url().optional(),
});

export const guardrailConfigSchema = z.object({
  allowedTopics: z.array(z.string().max(300)).default([]),
  bannedTopics: z.array(z.string().max(300)).default([]),
  allowedClaims: z.array(z.string().max(1000)).default([]),
  bannedClaims: z.array(z.string().max(1000)).default([]),
  requiredDisclosures: z.array(z.string().max(1000)).default([]),
  competitorRules: z
    .object({
      allowCompetitorMentions: z.boolean().default(false),
      competitorNames: z.array(z.string().max(200)).default([]),
    })
    .default({ allowCompetitorMentions: false, competitorNames: [] }),
  aggressionLevel: z.enum(AGGRESSION_LEVELS).default("NORMAL"),
  sensitiveTopicRules: z.array(z.string().max(1000)).default([]),
  escalationRules: z.array(z.string().max(1000)).default([]),
  platformSpecificRules: z.record(z.string(), z.array(z.string())).default({}),
  wordsToAvoid: z.array(z.string().max(100)).default([]),
});
export type GuardrailConfigInput = z.infer<typeof guardrailConfigSchema>;

export const generationRequestSchema = z.object({
  campaignId: z.string().min(1),
  contentType: z.enum(CONTENT_TYPES).default("TEXT_POST"),
  platform: z.enum(PLATFORMS).default("X"),
  instruction: z.string().max(5000).optional(),
  /** The comment being replied to — required for REPLY / DM_REPLY. */
  originalComment: z.string().max(10000).optional(),
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export const approvalActionSchema = z.object({
  action: z.enum(APPROVAL_ACTIONS),
  reason: z.string().max(5000).optional(),
  editInstruction: z.string().max(5000).optional(),
  /** Target platform for CHANGE_PLATFORM regenerations. */
  platform: z.enum(PLATFORMS).optional(),
  edits: z
    .object({
      title: z.string().max(300).optional(),
      hook: z.string().max(1000).optional(),
      script: z.string().max(20000).optional(),
      caption: z.string().max(5000).optional(),
      bodyText: z.string().max(20000).optional(),
      hashtags: z.array(z.string().max(100)).optional(),
      cta: z.string().max(1000).optional(),
      scheduledFor: z.coerce.date().optional(),
    })
    .optional(),
});
export type ApprovalActionInput = z.infer<typeof approvalActionSchema>;

// ---------------------------------------------------------------------------
// LLM structured-output schemas (plan §8)
// ---------------------------------------------------------------------------

export const brollPlanItemSchema = z.object({
  timestamp: z.string().describe('e.g. "0:03-0:06"'),
  description: z.string(),
  source: z.enum(BROLL_SOURCES),
});

export const generatedShortVideoSchema = z.object({
  title: z.string(),
  hook: z.string(),
  script: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  cta: z.string(),
  visualDirection: z.string(),
  cameraStyle: z.enum(CAMERA_STYLES),
  outfitSuggestion: z.string(),
  brollPlan: z.array(brollPlanItemSchema),
  thumbnailIdea: z.string(),
  campaignPlugType: z.enum(PLUG_TYPES),
  whyThisShouldWork: z.string(),
  riskNotes: z.array(z.string()),
});
export type GeneratedShortVideo = z.infer<typeof generatedShortVideoSchema>;

export const generatedTextPostSchema = z.object({
  body: z.string(),
  hook: z.string(),
  cta: z.string(),
  hashtags: z.array(z.string()),
  campaignPlugType: z.enum(PLUG_TYPES),
  whyThisShouldWork: z.string(),
  riskNotes: z.array(z.string()),
});
export type GeneratedTextPost = z.infer<typeof generatedTextPostSchema>;

export const generatedReplySchema = z.object({
  reply: z.string(),
  tone: z.string(),
  shouldMentionCampaign: z.boolean(),
  campaignMention: z.string(),
  riskLevel: z.enum(RISK_LEVELS),
  escalateToHuman: z.boolean(),
  reason: z.string(),
});
export type GeneratedReply = z.infer<typeof generatedReplySchema>;

// ---------------------------------------------------------------------------
// Guardrail result (plan §7.9)
// ---------------------------------------------------------------------------

export const guardrailResultSchema = z.object({
  passed: z.boolean(),
  riskScore: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  blockers: z.array(z.string()),
  requiredEdits: z.array(z.string()),
});
export type GuardrailResult = z.infer<typeof guardrailResultSchema>;
