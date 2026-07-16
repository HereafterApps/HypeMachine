import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AGGRESSION_LEVELS,
  CADENCE_TYPES,
  CAMPAIGN_TYPES,
  CONTENT_TYPES,
  DIRECTNESS_LEVELS,
  PLATFORMS,
  PLUG_FREQUENCIES,
  SOURCE_TYPES,
  slugify,
} from '@hype/core';
import type { AppContext } from '../context.js';

const CampaignBody = z.object({
  personaId: z.string().min(1),
  name: z.string().min(1),
  campaignType: z.enum(CAMPAIGN_TYPES).default('CUSTOM'),
  objective: z.string().default(''),
  targetAudience: z.string().optional(),
  productName: z.string().optional(),
  productDescription: z.string().optional(),
  productUrl: z.string().optional(),
  directnessLevel: z.enum(DIRECTNESS_LEVELS).default('CASUAL'),
  plugFrequency: z.enum(PLUG_FREQUENCIES).default('WHEN_NATURAL'),
  plugPercentage: z.number().int().min(0).max(100).optional(),
  mainMessage: z.string().optional(),
  productLine: z.string().optional(),
  primaryKpi: z.string().optional(),
  secondaryKpis: z.array(z.string()).default([]),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

const GuardrailBody = z.object({
  allowedTopics: z.array(z.string()).default([]),
  bannedTopics: z.array(z.string()).default([]),
  allowedClaims: z.array(z.string()).default([]),
  bannedClaims: z.array(z.string()).default([]),
  requiredDisclosures: z.array(z.string()).default([]),
  wordsToAvoid: z.array(z.string()).default([]),
  aggressionLevel: z.enum(AGGRESSION_LEVELS).default('NORMAL'),
  competitorRules: z
    .object({
      allowCompetitorMentions: z.boolean().default(false),
      names: z.array(z.string()).default([]),
    })
    .default({ allowCompetitorMentions: false, names: [] }),
});

export function campaignRoutes(ctx: AppContext) {
  return async function routes(app: FastifyInstance) {
    app.get('/campaigns', async (request) => {
      const { personaId } = request.query as { personaId?: string };
      return ctx.prisma.campaign.findMany({
        where: personaId ? { personaId } : undefined,
        include: {
          persona: { select: { name: true, slug: true } },
          schedules: true,
          _count: { select: { generatedContent: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    app.post('/campaigns', async (request, reply) => {
      const raw = (request.body ?? {}) as Record<string, unknown>;
      const guardrails = raw.guardrails ? GuardrailBody.parse(raw.guardrails) : undefined;
      const campaign = CampaignBody.parse(raw);
      const created = await ctx.prisma.campaign.create({
        data: {
          ...campaign,
          slug: slugify(campaign.name),
          guardrailConfig: guardrails
            ? {
                create: {
                  ...guardrails,
                  competitorRules: guardrails.competitorRules as object,
                },
              }
            : { create: {} },
        },
        include: { guardrailConfig: true },
      });
      return reply.code(201).send(created);
    });

    app.get('/campaigns/:id', async (request) => {
      const { id } = request.params as { id: string };
      return ctx.prisma.campaign.findUniqueOrThrow({
        where: { id },
        include: { persona: true, guardrailConfig: true, sources: true, schedules: true },
      });
    });

    app.patch('/campaigns/:id', async (request) => {
      const { id } = request.params as { id: string };
      const { guardrails, ...rest } = (request.body ?? {}) as Record<string, unknown> & {
        guardrails?: z.infer<typeof GuardrailBody>;
      };
      const body = CampaignBody.partial()
        .extend({ status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional() })
        .omit({ personaId: true })
        .parse(rest);
      if (guardrails) {
        const parsed = GuardrailBody.parse(guardrails);
        await ctx.prisma.guardrailConfig.upsert({
          where: { campaignId: id },
          update: { ...parsed, competitorRules: parsed.competitorRules as object },
          create: {
            campaignId: id,
            ...parsed,
            competitorRules: parsed.competitorRules as object,
          },
        });
      }
      return ctx.prisma.campaign.update({
        where: { id },
        data: body,
        include: { guardrailConfig: true },
      });
    });

    app.delete('/campaigns/:id', async (request) => {
      const { id } = request.params as { id: string };
      return ctx.prisma.campaign.update({ where: { id }, data: { status: 'ARCHIVED' } });
    });

    app.post('/campaigns/:id/sources', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          type: z.enum(SOURCE_TYPES),
          title: z.string().min(1),
          content: z.string().optional(),
          url: z.string().optional(),
          fileUrl: z.string().optional(),
        })
        .parse(request.body);
      const source = await ctx.prisma.campaignSource.create({
        data: { campaignId: id, ...body },
      });
      return reply.code(201).send(source);
    });

    app.post('/campaigns/:id/schedules', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          platform: z.enum(PLATFORMS),
          contentType: z.enum(CONTENT_TYPES),
          cadenceType: z.enum(CADENCE_TYPES).default('INTERVAL'),
          intervalMinutes: z.number().int().positive().optional(),
          cronExpression: z.string().optional(),
          timezone: z.string().default('UTC'),
          isActive: z.boolean().default(true),
          maxDailyCount: z.number().int().positive().optional(),
          quietHoursStart: z.number().int().min(0).max(23).optional(),
          quietHoursEnd: z.number().int().min(0).max(23).optional(),
        })
        .refine(
          (s) => (s.cadenceType === 'CRON' ? Boolean(s.cronExpression) : Boolean(s.intervalMinutes)),
          { message: 'CRON schedules need cronExpression; INTERVAL schedules need intervalMinutes.' },
        )
        .parse(request.body);
      const schedule = await ctx.prisma.contentSchedule.create({
        data: { campaignId: id, ...body, nextRunAt: new Date() },
      });
      return reply.code(201).send(schedule);
    });

    app.get('/campaigns/:id/analytics', async (request) => {
      const { id } = request.params as { id: string };
      const posts = await ctx.prisma.publishedPost.findMany({
        where: { generatedContent: { campaignId: id } },
        include: {
          snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 },
          generatedContent: { select: { contentType: true, hook: true, title: true } },
        },
      });
      const insights = await ctx.prisma.learningInsight.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: 'desc' },
      });
      const totals = posts.reduce(
        (acc, p) => {
          const s = p.snapshots[0];
          if (!s) return acc;
          acc.views += s.views;
          acc.likes += s.likes;
          acc.comments += s.comments;
          acc.shares += s.shares;
          return acc;
        },
        { views: 0, likes: 0, comments: 0, shares: 0 },
      );
      return { totals, posts, insights };
    });
  };
}
