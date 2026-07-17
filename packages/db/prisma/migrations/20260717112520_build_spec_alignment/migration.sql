-- CreateEnum
CREATE TYPE "OptimizationTarget" AS ENUM ('REACH', 'ENGAGEMENT', 'CLICKS', 'CLARITY', 'COMPLETION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignType" ADD VALUE 'PRODUCT_HYPE';
ALTER TYPE "CampaignType" ADD VALUE 'EDUCATION';
ALTER TYPE "CampaignType" ADD VALUE 'DEBUNK';
ALTER TYPE "CampaignType" ADD VALUE 'CIVIC_MECHANICS';

-- AlterTable
ALTER TABLE "AnalyticsSnapshot" ADD COLUMN     "missionMetric" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "optimizationTarget" "OptimizationTarget" NOT NULL DEFAULT 'REACH',
ADD COLUMN     "subject" TEXT;

-- AlterTable
ALTER TABLE "GeneratedContent" ADD COLUMN     "sourceCitations" TEXT[] DEFAULT ARRAY[]::TEXT[];
