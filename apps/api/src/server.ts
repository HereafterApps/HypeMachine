import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@hype/db';
import type { AppContext } from './context.js';
import { personaRoutes } from './routes/personas.js';
import { campaignRoutes } from './routes/campaigns.js';
import { contentRoutes } from './routes/content.js';
import { approvalRoutes } from './routes/approvals.js';
import { publishingRoutes } from './routes/publishing.js';
import { settingsRoutes } from './routes/settings.js';

export async function buildServer(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ ok: true }));

  // Single-user auth (v1, §3.1): static bearer token.
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;
    const header = request.headers.authorization;
    if (header !== `Bearer ${ctx.env.API_TOKEN}`) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Validation failed', issues: error.issues });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.code(400).send({ error: error.message });
    }
    const message = error instanceof Error ? error.message : 'Internal error';
    // Domain-rule violations from services read as 409s, not 500s.
    const conflict =
      /cannot be approved|only PENDING_APPROVAL|cannot reject|cannot edit|is (PAUSED|ARCHIVED)|guardrail blockers/i.test(
        message,
      );
    app.log.error(error);
    return reply.code(conflict ? 409 : 500).send({ error: message });
  });

  await app.register(personaRoutes(ctx));
  await app.register(campaignRoutes(ctx));
  await app.register(contentRoutes(ctx));
  await app.register(approvalRoutes(ctx));
  await app.register(publishingRoutes(ctx));
  await app.register(settingsRoutes(ctx));

  return app;
}
