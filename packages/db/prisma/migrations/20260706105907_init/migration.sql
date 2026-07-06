-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "PersonaStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PersonaType" AS ENUM ('VIRTUAL_INFLUENCER', 'BRAND_MASCOT', 'CARTOON', 'PUPPET', 'EXPERT', 'PROFESSOR', 'FOUNDER_AVATAR', 'FACELESS_CHANNEL', 'SATIRICAL_CHARACTER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('BACKSTORY', 'OPINION', 'HABIT', 'RECURRING_JOKE', 'PAST_POST', 'AUDIENCE_REACTION', 'CAMPAIGN_LEARNING', 'VISUAL_DETAIL', 'BANNED_BEHAVIOR', 'SUCCESSFUL_HOOK', 'FAILED_HOOK');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('FACE_REFERENCE', 'AVATAR_LOOK', 'VOICE_SAMPLE', 'ROOM_BACKGROUND', 'OUTFIT', 'INTRO', 'OUTRO', 'MUSIC', 'CAPTION_STYLE', 'LOGO', 'BROLL', 'SCREEN_RECORDING', 'THUMBNAIL_STYLE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('APP_PROMOTION', 'BRAND_AWARENESS', 'PRODUCT_LAUNCH', 'TREND_PROMOTION', 'MEDIA_LITERACY', 'EXPLAINER', 'COMMUNITY_BUILDING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DirectnessLevel" AS ENUM ('VERY_SUBTLE', 'SUBTLE', 'CASUAL', 'DIRECT', 'HARD_CTA');

-- CreateEnum
CREATE TYPE "PlugFrequency" AS ENUM ('EVERY_POST', 'MOST_POSTS', 'HALF_POSTS', 'WHEN_NATURAL', 'OCCASIONAL', 'RARE', 'CUSTOM_PERCENTAGE');

-- CreateEnum
CREATE TYPE "CampaignSourceType" AS ENUM ('PRODUCT_DOC', 'BRAND_GUIDELINES', 'WEBSITE_COPY', 'APP_SCREENSHOT', 'APP_VIDEO', 'USER_NOTE', 'COMPETITOR', 'CLAIM_BANK', 'FAQ', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AggressionLevel" AS ENUM ('SOFT', 'NORMAL', 'SPICY', 'CONTRARIAN', 'AGGRESSIVE_BUT_SAFE');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'X', 'THREADS', 'LINKEDIN', 'WHATSAPP', 'DISCORD', 'MANUAL_EXPORT');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('SHORT_VIDEO', 'TEXT_POST', 'THREAD', 'IMAGE_CAROUSEL', 'REPLY', 'DM_REPLY', 'WHATSAPP_MESSAGE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT_GENERATED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'NEEDS_EDIT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EDITED', 'REGENERATED');

-- CreateEnum
CREATE TYPE "VideoAssetStatus" AS ENUM ('PENDING', 'GENERATING_VOICE', 'GENERATING_AVATAR', 'GENERATING_BROLL', 'RENDERING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('PUBLISHED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "CadenceType" AS ENUM ('CRON', 'INTERVAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "PersonaStatus" NOT NULL DEFAULT 'ACTIVE',
    "personaType" "PersonaType" NOT NULL DEFAULT 'CUSTOM',
    "description" TEXT NOT NULL DEFAULT '',
    "backstory" TEXT NOT NULL DEFAULT '',
    "worldview" TEXT NOT NULL DEFAULT '',
    "speakingStyle" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT '',
    "humorStyle" TEXT NOT NULL DEFAULT '',
    "disclosureText" TEXT NOT NULL,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "defaultPlatformTone" TEXT NOT NULL DEFAULT '',
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaMemory" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "type" "MemoryType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaAsset" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "s3Key" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "campaignType" "CampaignType" NOT NULL DEFAULT 'CUSTOM',
    "objective" TEXT NOT NULL DEFAULT '',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "productName" TEXT NOT NULL DEFAULT '',
    "productDescription" TEXT NOT NULL DEFAULT '',
    "productUrl" TEXT,
    "directnessLevel" "DirectnessLevel" NOT NULL DEFAULT 'CASUAL',
    "plugFrequency" "PlugFrequency" NOT NULL DEFAULT 'WHEN_NATURAL',
    "plugPercentage" INTEGER,
    "primaryKpi" TEXT NOT NULL DEFAULT 'VIEWS',
    "secondaryKpis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSource" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "CampaignSourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "url" TEXT,
    "fileUrl" TEXT,
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardrailConfig" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "allowedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bannedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bannedClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredDisclosures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "competitorRules" JSONB NOT NULL DEFAULT '{"allowCompetitorMentions": false}',
    "aggressionLevel" "AggressionLevel" NOT NULL DEFAULT 'NORMAL',
    "sensitiveTopicRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "escalationRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platformSpecificRules" JSONB NOT NULL DEFAULT '{}',
    "wordsToAvoid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardrailConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAccount" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "profileUrl" TEXT,
    "authStatus" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentSchedule" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "cadenceType" "CadenceType" NOT NULL DEFAULT 'INTERVAL',
    "intervalMinutes" INTEGER,
    "cronExpression" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedContent" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT_GENERATED',
    "title" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL DEFAULT '',
    "script" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta" TEXT NOT NULL DEFAULT '',
    "generationPrompt" TEXT NOT NULL DEFAULT '',
    "generationMetadata" JSONB NOT NULL DEFAULT '{}',
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "guardrailResult" JSONB,
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" TEXT NOT NULL,
    "generatedContentId" TEXT NOT NULL,
    "status" "VideoAssetStatus" NOT NULL DEFAULT 'PENDING',
    "storyboardJson" JSONB,
    "voiceUrl" TEXT,
    "avatarVideoUrl" TEXT,
    "brollUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "finalVideoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "subtitlesUrl" TEXT,
    "provider" TEXT,
    "providerJobId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "generatedContentId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedVia" TEXT NOT NULL DEFAULT 'dashboard',
    "approvedByUserId" TEXT,
    "rejectionReason" TEXT,
    "editInstruction" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedPost" (
    "id" TEXT NOT NULL,
    "generatedContentId" TEXT NOT NULL,
    "platformAccountId" TEXT,
    "platform" "Platform" NOT NULL,
    "platformPostId" TEXT,
    "platformUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PublishStatus" NOT NULL DEFAULT 'PUBLISHED',
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "publishedPostId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sentimentScore" DOUBLE PRECISION,
    "rawMetrics" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningInsight" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "campaignId" TEXT,
    "platform" "Platform",
    "contentType" "ContentType",
    "insight" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "actionRecommendation" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_slug_key" ON "Persona"("slug");

-- CreateIndex
CREATE INDEX "PersonaMemory_personaId_type_idx" ON "PersonaMemory"("personaId", "type");

-- CreateIndex
CREATE INDEX "PersonaAsset_personaId_type_idx" ON "PersonaAsset"("personaId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "CampaignSource_campaignId_idx" ON "CampaignSource"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardrailConfig_campaignId_key" ON "GuardrailConfig"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAccount_personaId_platform_handle_key" ON "PlatformAccount"("personaId", "platform", "handle");

-- CreateIndex
CREATE INDEX "ContentSchedule_isActive_nextRunAt_idx" ON "ContentSchedule"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "GeneratedContent_status_idx" ON "GeneratedContent"("status");

-- CreateIndex
CREATE INDEX "GeneratedContent_campaignId_status_idx" ON "GeneratedContent"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_generatedContentId_key" ON "VideoAsset"("generatedContentId");

-- CreateIndex
CREATE INDEX "Approval_generatedContentId_idx" ON "Approval"("generatedContentId");

-- CreateIndex
CREATE INDEX "Approval_status_idx" ON "Approval"("status");

-- CreateIndex
CREATE INDEX "PublishedPost_platform_idx" ON "PublishedPost"("platform");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_publishedPostId_capturedAt_idx" ON "AnalyticsSnapshot"("publishedPostId", "capturedAt");

-- CreateIndex
CREATE INDEX "LearningInsight_personaId_idx" ON "LearningInsight"("personaId");

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaMemory" ADD CONSTRAINT "PersonaMemory_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaAsset" ADD CONSTRAINT "PersonaAsset_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSource" ADD CONSTRAINT "CampaignSource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardrailConfig" ADD CONSTRAINT "GuardrailConfig_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAccount" ADD CONSTRAINT "PlatformAccount_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSchedule" ADD CONSTRAINT "ContentSchedule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_generatedContentId_fkey" FOREIGN KEY ("generatedContentId") REFERENCES "GeneratedContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_generatedContentId_fkey" FOREIGN KEY ("generatedContentId") REFERENCES "GeneratedContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedPost" ADD CONSTRAINT "PublishedPost_generatedContentId_fkey" FOREIGN KEY ("generatedContentId") REFERENCES "GeneratedContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedPost" ADD CONSTRAINT "PublishedPost_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "PlatformAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_publishedPostId_fkey" FOREIGN KEY ("publishedPostId") REFERENCES "PublishedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningInsight" ADD CONSTRAINT "LearningInsight_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningInsight" ADD CONSTRAINT "LearningInsight_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
