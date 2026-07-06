import type { FastifyInstance } from "fastify";
import { getPrisma } from "@hype/db";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.get("/dashboard", async () => {
    const [
      pendingApprovals,
      scheduled,
      generatedTotal,
      publishedTotal,
      activePersonas,
      activeCampaigns,
      recentContent,
    ] = await Promise.all([
      prisma.generatedContent.count({ where: { status: "PENDING_APPROVAL" } }),
      prisma.generatedContent.count({ where: { status: "SCHEDULED" } }),
      prisma.generatedContent.count(),
      prisma.publishedPost.count(),
      prisma.persona.count({ where: { status: "ACTIVE" } }),
      prisma.campaign.count({ where: { status: "ACTIVE" } }),
      prisma.generatedContent.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          persona: { select: { name: true } },
          campaign: { select: { name: true } },
        },
      }),
    ]);

    return {
      pendingApprovals,
      scheduled,
      generatedTotal,
      publishedTotal,
      activePersonas,
      activeCampaigns,
      recentContent,
    };
  });
}
