import { LearningInsightPlanSchema, engagementRate, type AnalyticsMetrics } from '@hype/core';
import { buildSystemPrompt, OUTPUT_KIND_MARKER } from '@hype/ai';
import { MetricsUnavailableError } from '@hype/publishing';
import type { AppContext } from '../context.js';
import { withJobLog } from './job-log.js';

/** Analytics ingestion + learning loop (product-plan §7.8, §12). */
export class AnalyticsService {
  constructor(private readonly ctx: AppContext) {}

  /** Manual metric entry fallback (§21 Phase 6) — also used by tests. */
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
   * Learning loop (§12): compare performance across a campaign's posts,
   * generate an insight, store it AND write it into persona memory so future
   * generations adapt.
   */
  async generateInsights(campaignId: string) {
    return withJobLog(
      this.ctx,
      { jobName: 'GenerateLearningInsightsJob', campaignId, provider: this.ctx.llm.name },
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

        const performanceTable = withMetrics
          .map((p) => {
            const s = p.snapshots[0]!;
            const c = p.generatedContent;
            const mission =
              s.missionMetric != null ? ` missionMetric=${s.missionMetric}` : '';
            return `- [${c.contentType}/${p.platform}] hook="${c.hook ?? ''}" views=${s.views} engagement=${s.engagementRate}%${mission} broll=${c.contentType === 'SHORT_VIDEO' ? 'yes' : 'n/a'}`;
          })
          .join('\n');

        // Learning-loop constraint (build-spec §2.7): mission campaigns must
        // not be optimized toward raw engagement/reach.
        const missionTarget = ['CLARITY', 'COMPLETION'].includes(campaign.optimizationTarget);
        const optimizationInstruction = missionTarget
          ? `This campaign optimizes for ${campaign.optimizationTarget} (mission metric). Do NOT recommend maximizing raw engagement, reach, or outrage — evaluate what improved clarity/completion, even at the cost of views.`
          : `This campaign optimizes for ${campaign.optimizationTarget}.`;

        const systemPrompt = buildSystemPrompt({
          name: campaign.persona.name,
          backstory: campaign.persona.backstory,
          worldview: campaign.persona.worldview,
          speakingStyle: campaign.persona.speakingStyle,
          tone: campaign.persona.tone,
          humorStyle: campaign.persona.humorStyle,
          disclosureText: campaign.persona.disclosureText,
          memoryHighlights: [],
        });
        const userPrompt = [
          `Analyze this campaign's published content performance and produce ONE actionable learning insight.`,
          `Campaign: ${campaign.name} — ${campaign.objective}`,
          optimizationInstruction,
          `Performance:`,
          performanceTable,
          '',
          `${OUTPUT_KIND_MARKER} LEARNING_INSIGHT`,
        ].join('\n');

        const { data, usage } = await this.ctx.llm.generateStructured({
          systemPrompt,
          userPrompt,
          schema: LearningInsightPlanSchema,
        });

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

        // §12.3 — every learning insight becomes persona memory.
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

        return { insight, costUsd: usage.costUsd };
      },
    );
  }
}
