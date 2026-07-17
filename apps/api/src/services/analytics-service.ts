import { engagementRate, type AnalyticsMetrics } from '@hype/core';
import { MetricsUnavailableError } from '@hype/publishing';
import type { AppContext } from '../context.js';
import { withJobLog } from './job-log.js';

/** Analytics ingestion + learning loop (build-spec M4, product-plan §7.8/§12). */
export class AnalyticsService {
  constructor(private readonly ctx: AppContext) {}

  /** Manual metric entry fallback — also used by tests. */
  async recordMetrics(
    publishedPostId: string,
    metrics: Omit<AnalyticsMetrics, 'engagementRate'> & { engagementRate?: number },
  ) {
    const rate = metrics.engagementRate ?? engagementRate(metrics);
    return this.ctx.prisma.analyticsSnapshot.create({
      data: {
        publishedPostId,
        views: metrics.views,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        saves: metrics.saves,
        clicks: metrics.clicks,
        engagementRate: rate,
        sentimentScore: metrics.sentimentScore,
        missionMetric: metrics.missionMetric,
        rawMetrics: metrics.raw ? JSON.parse(JSON.stringify(metrics.raw)) : undefined,
      },
    });
  }

  /** Fetches metrics from providers for every LIVE post (FetchAnalyticsJob). */
  async ingestAll() {
    return withJobLog(this.ctx, { jobName: 'FetchAnalyticsJob' }, async () => {
      const posts = await this.ctx.prisma.publishedPost.findMany({
        where: { status: 'LIVE' },
      });
      let fetched = 0;
      for (const post of posts) {
        const provider = this.ctx.publishing.get(post.platform);
        if (!provider) continue;
        try {
          const metrics = await provider.fetchMetrics(post.platformPostId);
          await this.recordMetrics(post.id, metrics);
          fetched++;
        } catch (error) {
          if (error instanceof MetricsUnavailableError) continue; // manual platforms
          throw error;
        }
      }
      return { fetched, scanned: posts.length };
    });
  }

  /**
   * Learning loop: compare performance across a campaign's posts via the
   * pipeline service, store the insight AND write it into persona memory so
   * future generations adapt. Mission campaigns are never optimized for raw
   * engagement (build-spec §2.7) — the pipeline enforces the instruction.
   */
  async generateInsights(campaignId: string) {
    return withJobLog(
      this.ctx,
      { jobName: 'GenerateLearningInsightsJob', campaignId, provider: 'pipeline' },
      async () => {
        const campaign = await this.ctx.prisma.campaign.findUniqueOrThrow({
          where: { id: campaignId },
          include: { persona: true },
        });
        const posts = await this.ctx.prisma.publishedPost.findMany({
          where: { generatedContent: { campaignId } },
          include: {
            snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 },
            generatedContent: true,
          },
        });
        const withMetrics = posts.filter((p) => p.snapshots.length > 0);
        if (withMetrics.length < 2) {
          return { insight: null, reason: 'Need at least 2 posts with metrics to compare.' };
        }

        const performanceLines = withMetrics.map((p) => {
          const s = p.snapshots[0]!;
          const c = p.generatedContent;
          const mission = s.missionMetric != null ? ` missionMetric=${s.missionMetric}` : '';
          return `- [${c.contentType}/${p.platform}] hook="${c.hook ?? ''}" views=${s.views} engagement=${s.engagementRate}%${mission} broll=${c.contentType === 'SHORT_VIDEO' ? 'yes' : 'n/a'}`;
        });

        const result = await this.ctx.pipeline.insights({
          persona: {
            name: campaign.persona.name,
            backstory: campaign.persona.backstory,
            worldview: campaign.persona.worldview,
            speakingStyle: campaign.persona.speakingStyle,
            tone: campaign.persona.tone,
            humorStyle: campaign.persona.humorStyle,
            disclosureText: campaign.persona.disclosureText,
            memoryHighlights: [],
          },
          campaignName: campaign.name,
          objective: campaign.objective,
          optimizationTarget: campaign.optimizationTarget,
          performanceLines,
        });

        const data = result.insight;
        const insight = await this.ctx.prisma.learningInsight.create({
          data: {
            personaId: campaign.personaId,
            campaignId,
            insight: data.insight,
            evidence: data.evidence,
            confidence: data.confidence,
            actionRecommendation: data.actionRecommendation,
          },
        });

        // Every learning insight becomes persona memory (§12.3).
        await this.ctx.prisma.personaMemory.create({
          data: {
            personaId: campaign.personaId,
            type: 'CAMPAIGN_LEARNING',
            title: data.insight.slice(0, 80),
            content: `${data.insight} (confidence ${data.confidence}) — ${data.actionRecommendation}`,
            importance: Math.max(0.4, data.confidence),
            source: `insight:${insight.id}`,
          },
        });

        return { insight, costUsd: result.usage.costUsd };
      },
    );
  }
}
