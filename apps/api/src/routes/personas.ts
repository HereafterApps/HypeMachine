import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ASSET_TYPES, MEMORY_TYPES, PERSONA_TYPES, slugify } from '@hype/core';
import type { AppContext } from '../context.js';
import { MemoryService } from '../services/memory-service.js';

const PersonaBody = z.object({
  name: z.string().min(1),
  personaType: z.enum(PERSONA_TYPES).default('CUSTOM'),
  description: z.string().default(''),
  backstory: z.string().default(''),
  worldview: z.string().default(''),
  speakingStyle: z.string().default(''),
  tone: z.string().default(''),
  humorStyle: z.string().default(''),
  disclosureText: z.string().min(1).default('Virtual AI-driven character.'),
  defaultLanguage: z.string().default('en'),
  memoryEnabled: z.boolean().default(true),
});

const PersonaPatch = PersonaBody.partial().extend({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
});

export function personaRoutes(ctx: AppContext) {
  return async function routes(app: FastifyInstance) {
    const memory = new MemoryService(ctx);

    app.get('/personas', async () =>
      ctx.prisma.persona.findMany({
        include: {
          campaigns: { select: { id: true, name: true, status: true } },
          platformAccounts: { select: { platform: true, handle: true, authStatus: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );

    app.post('/personas', async (request, reply) => {
      const body = PersonaBody.parse(request.body);
      const owner = await ctx.prisma.user.findFirstOrThrow({ where: { role: 'OWNER' } });
      const persona = await ctx.prisma.persona.create({
        data: { ...body, slug: slugify(body.name), ownerId: owner.id },
      });
      return reply.code(201).send(persona);
    });

    app.get('/personas/:id', async (request) => {
      const { id } = request.params as { id: string };
      return ctx.prisma.persona.findUniqueOrThrow({
        where: { id },
        include: {
          campaigns: true,
          platformAccounts: true,
          assets: true,
          memories: { orderBy: { updatedAt: 'desc' }, take: 50 },
        },
      });
    });

    app.patch('/personas/:id', async (request) => {
      const { id } = request.params as { id: string };
      const body = PersonaPatch.parse(request.body);
      return ctx.prisma.persona.update({ where: { id }, data: body });
    });

    app.delete('/personas/:id', async (request) => {
      const { id } = request.params as { id: string };
      return ctx.prisma.persona.update({ where: { id }, data: { status: 'ARCHIVED' } });
    });

    app.post('/personas/:id/assets', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          type: z.enum(ASSET_TYPES),
          name: z.string().min(1),
          url: z.string().min(1),
          s3Key: z.string().optional(),
          isDefault: z.boolean().default(false),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(request.body);
      const asset = await ctx.prisma.personaAsset.create({
        data: { personaId: id, ...body, metadata: body.metadata as object | undefined },
      });
      return reply.code(201).send(asset);
    });

    app.get('/personas/:id/memory', async (request) => {
      const { id } = request.params as { id: string };
      const { q } = request.query as { q?: string };
      return memory.search(id, q, 50);
    });

    app.post('/personas/:id/memory', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          type: z.enum(MEMORY_TYPES),
          title: z.string().min(1),
          content: z.string().min(1),
          importance: z.number().min(0).max(1).default(0.5),
          source: z.string().optional(),
        })
        .parse(request.body);
      const created = await memory.add(id, body);
      return reply.code(201).send(created);
    });
  };
}
