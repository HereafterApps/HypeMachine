import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  approvalActionSchema,
  CONTENT_STATUSES,
  generationRequestSchema,
} from "@hype/core";
import { getPrisma } from "@hype/db";
import { notFound } from "../lib/errors.js";
import { applyApprovalAction } from "../services/approvals.js";
import { generateContent } from "../services/generation.js";

const contentListQuerySchema = z.object({
  status: z.enum(CONTENT_STATUSES).optional(),
  campaignId: z.string().optional(),
  personaId: z.string().optional(),
});

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.post("/generation/run", async (request, reply) => {
    const input = generationRequestSchema.parse(request.body);
    const content = await generateContent(input);
    reply.code(201);
    return content;
  });

  app.get("/content", async (request) => {
    const query = contentListQuerySchema.parse(request.query);
    return prisma.generatedContent.findMany({
      where: {
        status: query.status,
        campaignId: query.campaignId,
        personaId: query.personaId,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        persona: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
        videoAsset: { select: { id: true, status: true, finalVideoUrl: true } },
      },
    });
  });

  app.get("/content/:id", async (request) => {
    const { id } = request.params as { id: string };
    const content = await prisma.generatedContent.findUnique({
      where: { id },
      include: {
        persona: { select: { id: true, name: true, disclosureText: true } },
        campaign: { select: { id: true, name: true } },
        videoAsset: true,
        approvals: { orderBy: { createdAt: "desc" } },
        publishedPosts: true,
      },
    });
    if (!content) throw notFound("Generated content");
    return content;
  });

  app.delete("/content/:id", async (request) => {
    const { id } = request.params as { id: string };
    return prisma.generatedContent.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
  });

  app.get("/approvals", async () => {
    return prisma.generatedContent.findMany({
      where: { status: "PENDING_APPROVAL" },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        persona: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
  });

  app.post("/approvals/:contentId", async (request) => {
    const { contentId } = request.params as { contentId: string };
    const input = approvalActionSchema.parse(request.body);
    return applyApprovalAction(contentId, input);
  });
}
