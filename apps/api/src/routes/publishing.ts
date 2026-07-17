import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { PublishingService } from '../services/publishing-service.js';
import { AnalyticsService } from '../services/analytics-service.js';

export function publishingRoutes(ctx: AppContext) {
  return async function routes(app: FastifyInstance) {
    const publishing = new PublishingService(ctx);
    const analytics = new AnalyticsService(ctx);

    app.post('/publish/:contentId', async (request) => {
      const { contentId } = request.params as { contentId: string };
      return publishing.publish(contentId);
    });

    app.get('/published', async () =>
      ctx.prisma.publishedPost.findMany({
        include: {
          generatedContent: {
            select: {
              contentType: true,
              title: true,
              hook: true,
              persona: { select: { name: true } },
              campaign: { select: { name: true } },
            },
          },
          snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 },
        },
        orderBy: { publishedAt: 'desc' },
      }),
    );

    app.get('/published/:id/metrics', async (request) => {
      const { id } = request.params as { id: string };
      return ctx.prisma.analyticsSnapshot.findMany({
        where: { publishedPostId: id },
        orderBy: { capturedAt: 'desc' },
      });
    });

    // Manual metric entry fallback (§21 Phase 6).
    app.post('/published/:id/metrics', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          views: z.number().int().min(0).default(0),
          likes: z.number().int().min(0).default(0),
          comments: z.number().int().min(0).default(0),
          shares: z.number().int().min(0).default(0),
          saves: z.number().int().min(0).default(0),
          clicks: z.number().int().min(0).default(0),
          sentimentScore: z.number().min(-1).max(1).optional(),
          missionMetric: z.number().min(0).optional(),
        })
        .parse(request.body);
      const snapshot = await analytics.recordMetrics(id, body);
      return reply.code(201).send(snapshot);
    });

    // Learning loop trigger (§12).
    app.post('/analytics/insights/:campaignId', async (request) => {
      const { campaignId } = request.params as { campaignId: string };
      return analytics.generateInsights(campaignId);
    });
  };
}
