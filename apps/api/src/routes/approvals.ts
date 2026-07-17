import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { APPROVAL_ACTIONS } from '@hype/core';
import type { AppContext } from '../context.js';
import { ApprovalService } from '../services/approval-service.js';

export function approvalRoutes(ctx: AppContext) {
  return async function routes(app: FastifyInstance) {
    const approvals = new ApprovalService(ctx);

    app.get('/approvals', async () =>
      ctx.prisma.generatedContent.findMany({
        where: { status: { in: ['PENDING_APPROVAL', 'NEEDS_EDIT'] } },
        include: {
          persona: { select: { name: true } },
          campaign: { select: { name: true } },
          videoAsset: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    );

    app.get('/approvals/:id', async (request) => {
      const { id } = request.params as { id: string };
      // Approval detail page (§6.9): content + guardrail checklist + history.
      return ctx.prisma.generatedContent.findUniqueOrThrow({
        where: { id },
        include: {
          persona: true,
          campaign: { include: { guardrailConfig: true } },
          videoAsset: true,
          approvals: { orderBy: { createdAt: 'desc' } },
        },
      });
    });

    app.post('/approvals/:id/approve', async (request) => {
      const { id } = request.params as { id: string };
      const body = z.object({ userId: z.string().optional() }).parse(request.body ?? {});
      return approvals.approve(id, body.userId);
    });

    app.post('/approvals/:id/reject', async (request) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({ reason: z.string().min(1), userId: z.string().optional() })
        .parse(request.body);
      return approvals.reject(id, body.reason, body.userId);
    });

    app.post('/approvals/:id/edit', async (request) => {
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
          sourceCitations: z.array(z.string()).optional(),
          scheduledFor: z.coerce.date().nullable().optional(),
          editInstruction: z.string().optional(),
          userId: z.string().optional(),
        })
        .parse(request.body);
      const { userId, ...edits } = body;
      return approvals.edit(id, edits, userId);
    });

    app.post('/approvals/:id/regenerate', async (request) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          action: z.enum(APPROVAL_ACTIONS).default('REGENERATE'),
          instruction: z.string().optional(),
          userId: z.string().optional(),
        })
        .parse(request.body ?? {});
      return approvals.regenerate(id, body.action, body.instruction, body.userId);
    });
  };
}
