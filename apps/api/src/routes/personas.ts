import type { FastifyInstance } from "fastify";
import {
  personaAssetCreateSchema,
  personaCreateSchema,
  personaMemoryCreateSchema,
  personaUpdateSchema,
} from "@hype/core";
import { getPrisma } from "@hype/db";
import { notFound } from "../lib/errors.js";
import { uniqueSlug } from "../lib/slug.js";

export async function personaRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.get("/personas", async () => {
    return prisma.persona.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { campaigns: true, generatedContent: true } },
      },
    });
  });

  app.post("/personas", async (request, reply) => {
    const input = personaCreateSchema.parse(request.body);
    const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
    const persona = await prisma.persona.create({
      data: {
        ...input,
        slug: input.slug ?? uniqueSlug(input.name),
        ownerId:
          owner?.id ??
          (
            await prisma.user.create({
              data: { name: "Owner", email: "owner@local", role: "OWNER" },
            })
          ).id,
      },
    });
    reply.code(201);
    return persona;
  });

  app.get("/personas/:id", async (request) => {
    const { id } = request.params as { id: string };
    const persona = await prisma.persona.findUnique({
      where: { id },
      include: {
        campaigns: true,
        assets: true,
        platformAccounts: true,
        _count: { select: { memories: true, generatedContent: true } },
      },
    });
    if (!persona) throw notFound("Persona");
    return persona;
  });

  app.patch("/personas/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = personaUpdateSchema.parse(request.body);
    return prisma.persona.update({ where: { id }, data: input });
  });

  app.delete("/personas/:id", async (request) => {
    const { id } = request.params as { id: string };
    // Archive rather than hard-delete: content history stays auditable.
    return prisma.persona.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
  });

  app.get("/personas/:id/memory", async (request) => {
    const { id } = request.params as { id: string };
    return prisma.personaMemory.findMany({
      where: { personaId: id },
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
    });
  });

  app.post("/personas/:id/memory", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = personaMemoryCreateSchema.parse(request.body);
    const memory = await prisma.personaMemory.create({
      data: { ...input, personaId: id },
    });
    reply.code(201);
    return memory;
  });

  app.post("/personas/:id/assets", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = personaAssetCreateSchema.parse(request.body);
    const asset = await prisma.personaAsset.create({
      data: { ...input, personaId: id, metadata: input.metadata as object },
    });
    reply.code(201);
    return asset;
  });
}
