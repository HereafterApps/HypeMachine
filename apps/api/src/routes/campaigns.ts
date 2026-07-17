import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AGGRESSION_LEVELS,
  CADENCE_TYPES,
  CAMPAIGN_TYPES,
  CONTENT_TYPES,
  DIRECTNESS_LEVELS,
  MISSION_OPTIMIZATION_TARGETS,
  OPTIMIZATION_TARGETS,
  PLATFORMS,
  PLUG_FREQUENCIES,
  SOURCE_TYPES,
  isMissionCampaignType,
  slugify,
  type OptimizationTarget,
} from '@hype/core';
import type { AppContext } from '../context.js';

const CampaignBody = z.object({
  personaId: z.string().min(1),
  name: z.string().min(1),
  campaignType: z.enum(CAMPAIGN_TYPES).default('CUSTOM'),
  objective: z.string().default(''),
  subject: z.string().optional(),
  optimizationTarget: z.enum(OPTIMIZATION_TARGETS).optional(),
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

/**
 * Learning-loop constraint (build-spec §2.7): mission campaign types must
 * not optimize for raw engagement/reach. Returns the resolved target or
 * throws with a 4xx-worthy message.
 */
function resolveOptimizationTarget(
  campaignType: string,
  requested: OptimizationTarget | undefined,
): OptimizationTarget {
  if (isMissionCampaignType(campaignType)) {
    if (requested && !(MISSION_OPTIMIZATION_TARGETS as readonly string[]).includes(requested)) {
      throw new Error(
        `${campaignType} campaigns cannot optimize for ${requested} (§2.7): allowed targets are ${MISSION_OPTIMIZATION_TARGETS.join(', ')}.`,
      );
    }
    return requested ?? 'CLARITY';
  }
  return requested ?? 'REACH';
}

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
      const optimizationTarget = resolveOptimizationTarget(
        campaign.campaignType,
        campaign.optimizationTarget,
      );

      // Coordination guardrail (§2.4): a different persona may not run an
      // ACTIVE campaign on the same subject at the same time.
      const subject = (campaign.subject ?? campaign.productName ?? '').trim().toLowerCase();
      if (subject) {
        const overlapping = await ctx.prisma.campaign.findMany({
          where: { personaId: { not: campaign.personaId }, status: 'ACTIVE' },
          select: { subject: true, productName: true, persona: { select: { name: true } } },
        });
        const conflict = overlapping.find(
          (c) => (c.subject ?? c.productName ?? '').trim().toLowerCase() === subject,
        );
        if (conflict) {
          return reply.code(409).send({
            error: `Coordination guardrail (§2.4): persona "${conflict.persona.name}" already runs an ACTIVE campaign on subject "${subject}". Multiple personas must not push the same message simultaneously.`,
          });
        }
      }

      const created = await ctx.prisma.campaign.create({
        data: {
          ...campaign,
          optimizationTarget,
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
      if (body.campaignType || body.optimizationTarget) {
        const existing = await ctx.prisma.campaign.findUniqueOrThrow({ where: { id } });
        const effectiveType = body.campaignType ?? existing.campaignType;
        if (isMissionCampaignType(effectiveType)) {
          // Coerce a carried-over engagement target to CLARITY; reject an
          // explicitly requested one (§2.7).
          const carriedOver =
            (MISSION_OPTIMIZATION_TARGETS as readonly string[]).includes(
              existing.optimizationTarget,
            )
              ? existing.optimizationTarget
              : undefined;
          body.optimizationTarget = resolveOptimizationTarget(
            effectiveType,
            body.optimizationTarget ?? carriedOver,
          );
        }
      }
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
      const campaign = await ctx.prisma.campaign.findUniqueOrThrow({ where: { id } });
      if (campaign.campaignType === 'DEBUNK') {
        // §7.1 open decision: until topic selection is settled, every debunk
        // topic is human-picked per item — no automated generation cadence.
        return reply.code(409).send({
          error:
            'DEBUNK campaigns cannot have automated schedules: a human picks every debunk topic (build-spec §7.1). Use POST /generation/run/:campaignId with claimToDebunk.',
        });
      }
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
