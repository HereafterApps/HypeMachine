import type { FastifyInstance } from "fastify";
import {
  campaignCreateSchema,
  campaignSourceCreateSchema,
  campaignUpdateSchema,
  guardrailConfigSchema,
} from "@hype/core";
import { getPrisma } from "@hype/db";
import { notFound } from "../lib/errors.js";
import { uniqueSlug } from "../lib/slug.js";

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.get("/campaigns", async (request) => {
    const { personaId } = request.query as { personaId?: string };
    return prisma.campaign.findMany({
      where: personaId ? { personaId } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        persona: { select: { id: true, name: true, slug: true } },
        _count: { select: { generatedContent: true } },
      },
    });
  });

  app.post("/campaigns", async (request, reply) => {
    const input = campaignCreateSchema.parse(request.body);
    const campaign = await prisma.campaign.create({
      data: {
        ...input,
        slug: input.slug ?? uniqueSlug(input.name),
        // Every campaign gets a guardrail row up front so the config is
        // always editable and the generation pipeline always has one.
        guardrailConfig: { create: {} },
      },
      include: { guardrailConfig: true },
    });
    reply.code(201);
    return campaign;
  });

  app.get("/campaigns/:id", async (request) => {
    const { id } = request.params as { id: string };
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        persona: true,
        sources: true,
        guardrailConfig: true,
        schedules: true,
      },
    });
    if (!campaign) throw notFound("Campaign");
    return campaign;
  });

  app.patch("/campaigns/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = campaignUpdateSchema.parse(request.body);
    return prisma.campaign.update({ where: { id }, data: input });
  });

  app.delete("/campaigns/:id", async (request) => {
    const { id } = request.params as { id: string };
    return prisma.campaign.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
  });

  app.post("/campaigns/:id/sources", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = campaignSourceCreateSchema.parse(request.body);
    const source = await prisma.campaignSource.create({
      data: { ...input, campaignId: id },
    });
    reply.code(201);
    return source;
  });

  app.put("/campaigns/:id/guardrails", async (request) => {
    const { id } = request.params as { id: string };
    const input = guardrailConfigSchema.parse(request.body);
    return prisma.guardrailConfig.upsert({
      where: { campaignId: id },
      create: {
        campaignId: id,
        ...input,
        competitorRules: input.competitorRules as object,
        platformSpecificRules: input.platformSpecificRules as object,
      },
      update: {
        ...input,
        competitorRules: input.competitorRules as object,
        platformSpecificRules: input.platformSpecificRules as object,
      },
    });
  });
}
