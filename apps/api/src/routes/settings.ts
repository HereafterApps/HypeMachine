import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';

export function settingsRoutes(ctx: AppContext) {
  return async function routes(app: FastifyInstance) {
    app.get('/settings/providers', async () => ({
      pipeline: await ctx.pipeline
        .health()
        .then((h) => ({ reachable: true, provider: h.provider, url: ctx.env.PIPELINE_URL }))
        .catch(() => ({ reachable: false, provider: 'unknown', url: ctx.env.PIPELINE_URL })),
      storage: { driver: ctx.storage.driver },
      notifications: { channels: ctx.env.NOTIFY_CHANNELS.split(',') },
      publishing: {
        implemented: ['MANUAL_EXPORT'],
        slots: ['YOUTUBE', 'X', 'TIKTOK', 'INSTAGRAM', 'LINKEDIN', 'FACEBOOK', 'THREADS', 'WHATSAPP'],
      },
    }));

    app.post('/settings/test-discord', async (_request, reply) => {
      await ctx.notifier.notify({
        kind: 'ANALYTICS_MILESTONE',
        title: 'Hype Machine test notification',
        body: 'If you can read this, your notification channels are wired up.',
        dashboardUrl: ctx.env.DASHBOARD_BASE_URL,
      });
      return reply.send({ sent: true });
    });

    // Jobs/observability page data (§24).
    app.get('/settings/jobs', async () =>
      ctx.prisma.jobLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    );
  };
}
