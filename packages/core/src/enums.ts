// Shared string-literal enums, mirrored by the Prisma schema in @hype/db.
// Keep the two in sync — these are the wire/API representation.

export const PERSONA_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type PersonaStatus = (typeof PERSONA_STATUSES)[number];

export const PERSONA_TYPES = [
  "VIRTUAL_INFLUENCER",
  "BRAND_MASCOT",
  "CARTOON",
  "PUPPET",
  "EXPERT",
  "PROFESSOR",
  "FOUNDER_AVATAR",
  "FACELESS_CHANNEL",
  "SATIRICAL_CHARACTER",
  "CUSTOM",
] as const;
export type PersonaType = (typeof PERSONA_TYPES)[number];

export const MEMORY_TYPES = [
  "BACKSTORY",
  "OPINION",
  "HABIT",
  "RECURRING_JOKE",
  "PAST_POST",
  "AUDIENCE_REACTION",
  "CAMPAIGN_LEARNING",
  "VISUAL_DETAIL",
  "BANNED_BEHAVIOR",
  "SUCCESSFUL_HOOK",
  "FAILED_HOOK",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const ASSET_TYPES = [
  "FACE_REFERENCE",
  "AVATAR_LOOK",
  "VOICE_SAMPLE",
  "ROOM_BACKGROUND",
  "OUTFIT",
  "INTRO",
  "OUTRO",
  "MUSIC",
  "CAPTION_STYLE",
  "LOGO",
  "BROLL",
  "SCREEN_RECORDING",
  "THUMBNAIL_STYLE",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const CAMPAIGN_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TYPES = [
  "APP_PROMOTION",
  "BRAND_AWARENESS",
  "PRODUCT_LAUNCH",
  "TREND_PROMOTION",
  "MEDIA_LITERACY",
  "EXPLAINER",
  "COMMUNITY_BUILDING",
  "CUSTOM",
] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const DIRECTNESS_LEVELS = [
  "VERY_SUBTLE",
  "SUBTLE",
  "CASUAL",
  "DIRECT",
  "HARD_CTA",
] as const;
export type DirectnessLevel = (typeof DIRECTNESS_LEVELS)[number];

export const PLUG_FREQUENCIES = [
  "EVERY_POST",
  "MOST_POSTS",
  "HALF_POSTS",
  "WHEN_NATURAL",
  "OCCASIONAL",
  "RARE",
  "CUSTOM_PERCENTAGE",
] as const;
export type PlugFrequency = (typeof PLUG_FREQUENCIES)[number];

export const CAMPAIGN_SOURCE_TYPES = [
  "PRODUCT_DOC",
  "BRAND_GUIDELINES",
  "WEBSITE_COPY",
  "APP_SCREENSHOT",
  "APP_VIDEO",
  "USER_NOTE",
  "COMPETITOR",
  "CLAIM_BANK",
  "FAQ",
  "CUSTOM",
] as const;
export type CampaignSourceType = (typeof CAMPAIGN_SOURCE_TYPES)[number];

export const AGGRESSION_LEVELS = [
  "SOFT",
  "NORMAL",
  "SPICY",
  "CONTRARIAN",
  "AGGRESSIVE_BUT_SAFE",
] as const;
export type AggressionLevel = (typeof AGGRESSION_LEVELS)[number];

export const PLATFORMS = [
  "YOUTUBE",
  "TIKTOK",
  "INSTAGRAM",
  "FACEBOOK",
  "X",
  "THREADS",
  "LINKEDIN",
  "WHATSAPP",
  "DISCORD",
  "MANUAL_EXPORT",
] as const;
export type Platform = (typeof PLATFORMS)[number];

// NOTE: no forum-style content type by design — see docs/product-plan.md §0.1.
// WHATSAPP_MESSAGE is limited to opted-in broadcasts / Business API replies.
export const CONTENT_TYPES = [
  "SHORT_VIDEO",
  "TEXT_POST",
  "THREAD",
  "IMAGE_CAROUSEL",
  "REPLY",
  "DM_REPLY",
  "WHATSAPP_MESSAGE",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STATUSES = [
  "DRAFT_GENERATED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "NEEDS_EDIT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "ARCHIVED",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const APPROVAL_ACTIONS = [
  "APPROVE",
  "REJECT",
  "EDIT",
  "REGENERATE",
  "MAKE_FUNNIER",
  "MAKE_SHORTER",
  "MAKE_MORE_SUBTLE",
  "MAKE_MORE_DIRECT",
  "CHANGE_HOOK",
  "CHANGE_CTA",
  "CHANGE_PLATFORM",
  "CHANGE_VISUAL_STYLE",
] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const CAMERA_STYLES = [
  "WEBCAM_DESK",
  "PHONE_SELFIE",
  "PODCAST_SETUP",
  "OUTDOOR_WALKING",
  "STUDIO",
  "GREENSCREEN",
  "CUSTOM",
] as const;
export type CameraStyle = (typeof CAMERA_STYLES)[number];

export const PLUG_TYPES = ["NONE", "SUBTLE", "CASUAL", "DIRECT"] as const;
export type PlugType = (typeof PLUG_TYPES)[number];

export const BROLL_SOURCES = [
  "AI_GENERATED",
  "USER_ASSET",
  "SCREEN_RECORDING",
  "STOCK",
] as const;
export type BrollSource = (typeof BROLL_SOURCES)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
