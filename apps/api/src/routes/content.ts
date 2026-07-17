import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CONTENT_STATUSES, CONTENT_TYPES, PLATFORMS } from '@hype/core';
import type { AppContext } from '../context.js';
import { GenerationService } from '../services/generation-service.js';

export function contentRoutes(ctx: AppContext) {
  return async function routes(app: FastifyInstance) {
    const generation = new GenerationService(ctx);

    // --- Generation routes (§17) ---
    app.post('/generation/run/:campaignId', async (request, reply) => {
      const { campaignId } = request.params as { campaignId: string };
      const body = z
        .object({
          platform: z.enum(PLATFORMS),
          contentType: z.enum(CONTENT_TYPES),
          extraInstructions: z.string().optional(),
          scheduledFor: z.coerce.date().optional(),
          replyingTo: z.string().optional(),
          claimToDebunk: z.string().min(1).optional(),
        })
        .parse(request.body);
      const result = await generation.generate({ campaignId, ...body });
      return reply.code(201).send(result);
    });

    // "Generate Now" across every active schedule of a campaign (§26 step 6).
    app.post('/generation/run', async (request, reply) => {
      const body = z.object({ campaignId: z.string().min(1) }).parse(request.body);
      const schedules = await ctx.prisma.contentSchedule.findMany({
        where: { campaignId: body.campaignId, isActive: true },
      });
      if (schedules.length === 0) {
        return reply.code(400).send({ error: 'Campaign has no active schedules.' });
      }
      const results = [];
      for (const schedule of schedules) {
        results.push(
          await generation.generate({
            campaignId: body.campaignId,
            platform: schedule.platform,
            contentType: schedule.contentType,
          }),
        );
      }
      return reply.code(201).send(results);
    });

    // --- Content queue (§6.8) ---
    app.get('/content', async (request) => {
      const query = z
        .object({
          personaId: z.string().optional(),
          campaignId: z.string().optional(),
          platform: z.enum(PLATFORMS).optional(),
          contentType: z.enum(CONTENT_TYPES).optional(),
          status: z.enum(CONTENT_STATUSES).optional(),
          take: z.coerce.number().int().min(1).max(200).default(50),
        })
        .parse(request.query);
      const { take, ...where } = query;
      return ctx.prisma.generatedContent.findMany({
        where,
        include: {
          persona: { select: { name: true, slug: true } },
          campaign: { select: { name: true, slug: true } },
          videoAsset: true,
          approvals: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take,
      });
    });

    app.get('/content/:id', async (request) => {
      const { id } = request.params as { id: string };
      return ctx.prisma.generatedContent.findUniqueOrThrow({
        where: { id },
        include: {
          persona: true,
          campaign: true,
          videoAsset: true,
          approvals: { orderBy: { createdAt: 'desc' } },
          publishedPosts: true,
        },
      });
    });

    app.patch('/content/:id', async (request) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          title: z.string().optional(),
          hook: z.string().optional(),
          script: z.string().optional(),
          caption: z.string().optional(),
          bodyText: z.string().optional(),
          hashtags: z.array(z.string()).optional(),
          cta: z.string().optional(),
          scheduledFor: z.coerce.date().nullable().optional(),
        })
        .parse(request.body);
      return ctx.prisma.generatedContent.update({ where: { id }, data: body });
    });

    app.delete('/content/:id', async (request) => {
      const { id } = request.params as { id: string };
      return ctx.prisma.generatedContent.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });
    });
  };
}
