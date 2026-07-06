import {
  generatedShortVideoSchema,
  generatedTextPostSchema,
  guardrailConfigSchema,
  type GenerationRequest,
} from "@hype/core";
import { getPrisma, type GeneratedContent } from "@hype/db";
import {
  AnthropicProvider,
  buildShortVideoPrompt,
  buildSystemPrompt,
  buildTextPostPrompt,
  type CampaignContext,
  type LlmProvider,
  type PersonaContext,
} from "@hype/ai";
import { runGuardrails } from "@hype/guardrails";
import { badRequest, notFound } from "../lib/errors.js";

let provider: LlmProvider | undefined;

export function getLlmProvider(): LlmProvider {
  if (!provider) {
    provider = new AnthropicProvider();
  }
  return provider;
}

/** Test/DI hook. */
export function setLlmProvider(p: LlmProvider): void {
  provider = p;
}

async function loadContexts(campaignId: string): Promise<{
  persona: PersonaContext;
  campaign: CampaignContext;
  personaId: string;
  guardrailConfig: ReturnType<typeof guardrailConfigSchema.parse>;
}> {
  const prisma = getPrisma();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      persona: { include: { memories: { orderBy: { importance: "desc" }, take: 15 } } },
      sources: { take: 20 },
      guardrailConfig: true,
      learningInsights: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!campaign) throw notFound("Campaign");
  if (campaign.status !== "ACTIVE") throw badRequest("Campaign is not active");
  if (campaign.persona.status !== "ACTIVE") {
    throw badRequest("Persona is not active");
  }

  const persona: PersonaContext = {
    name: campaign.persona.name,
    personaType: campaign.persona.personaType,
    description: campaign.persona.description,
    backstory: campaign.persona.backstory,
    worldview: campaign.persona.worldview,
    speakingStyle: campaign.persona.speakingStyle,
    tone: campaign.persona.tone,
    humorStyle: campaign.persona.humorStyle,
    disclosureText: campaign.persona.disclosureText,
    defaultLanguage: campaign.persona.defaultLanguage,
    memoryHighlights: campaign.persona.memoryEnabled
      ? campaign.persona.memories.map((m) => ({
          type: m.type,
          title: m.title,
          content: m.content,
        }))
      : [],
  };

  const guardrailConfig = guardrailConfigSchema.parse({
    allowedTopics: campaign.guardrailConfig?.allowedTopics ?? [],
    bannedTopics: campaign.guardrailConfig?.bannedTopics ?? [],
    allowedClaims: campaign.guardrailConfig?.allowedClaims ?? [],
    bannedClaims: campaign.guardrailConfig?.bannedClaims ?? [],
    requiredDisclosures: campaign.guardrailConfig?.requiredDisclosures ?? [],
    competitorRules: campaign.guardrailConfig?.competitorRules ?? undefined,
    aggressionLevel: campaign.guardrailConfig?.aggressionLevel ?? "NORMAL",
    sensitiveTopicRules: campaign.guardrailConfig?.sensitiveTopicRules ?? [],
    escalationRules: campaign.guardrailConfig?.escalationRules ?? [],
    platformSpecificRules:
      (campaign.guardrailConfig?.platformSpecificRules as Record<string, string[]>) ?? {},
    wordsToAvoid: campaign.guardrailConfig?.wordsToAvoid ?? [],
  });

  const campaignContext: CampaignContext = {
    name: campaign.name,
    campaignType: campaign.campaignType,
    objective: campaign.objective,
    targetAudience: campaign.targetAudience,
    productName: campaign.productName,
    productDescription: campaign.productDescription,
    productUrl: campaign.productUrl,
    directnessLevel: campaign.directnessLevel,
    plugFrequency: campaign.plugFrequency,
    plugPercentage: campaign.plugPercentage,
    allowedClaims: guardrailConfig.allowedClaims,
    bannedClaims: guardrailConfig.bannedClaims,
    sources: campaign.sources.map((s) => ({
      type: s.type,
      title: s.title,
      content: s.content,
    })),
    recentLearnings: campaign.learningInsights.map((l) => l.insight),
  };

  return {
    persona,
    campaign: campaignContext,
    personaId: campaign.personaId,
    guardrailConfig,
  };
}

/**
 * Generation pipeline (plan §7.3): load contexts → build prompt → generate
 * structured content → run guardrails → save as PENDING_APPROVAL.
 * Nothing is ever published from here — human approval is mandatory (§1.3).
 */
export async function generateContent(
  request: GenerationRequest,
): Promise<GeneratedContent> {
  const prisma = getPrisma();
  const { persona, campaign, personaId, guardrailConfig } = await loadContexts(
    request.campaignId,
  );

  const systemPrompt = buildSystemPrompt(persona);
  const platformContext = {
    platform: request.platform,
    contentType: request.contentType,
  };

  const llm = getLlmProvider();

  let fields: {
    title: string;
    hook: string;
    script: string;
    caption: string;
    bodyText: string;
    hashtags: string[];
    cta: string;
    generationMetadata: Record<string, unknown>;
    guardrailText: string;
    riskNotes: string[];
    campaignPlugType: string;
  };
  let userPrompt: string;

  if (request.contentType === "SHORT_VIDEO") {
    userPrompt = buildShortVideoPrompt(campaign, platformContext, request.instruction);
    const video = await llm.generateStructured({
      systemPrompt,
      userPrompt,
      schema: generatedShortVideoSchema,
    });
    fields = {
      title: video.title,
      hook: video.hook,
      script: video.script,
      caption: video.caption,
      bodyText: "",
      hashtags: video.hashtags,
      cta: video.cta,
      generationMetadata: {
        visualDirection: video.visualDirection,
        cameraStyle: video.cameraStyle,
        outfitSuggestion: video.outfitSuggestion,
        brollPlan: video.brollPlan,
        thumbnailIdea: video.thumbnailIdea,
        whyThisShouldWork: video.whyThisShouldWork,
      },
      guardrailText: [video.title, video.hook, video.script, video.caption, video.cta].join(
        "\n",
      ),
      riskNotes: video.riskNotes,
      campaignPlugType: video.campaignPlugType,
    };
  } else if (request.contentType === "TEXT_POST" || request.contentType === "THREAD") {
    userPrompt = buildTextPostPrompt(campaign, platformContext, request.instruction);
    const post = await llm.generateStructured({
      systemPrompt,
      userPrompt,
      schema: generatedTextPostSchema,
    });
    fields = {
      title: "",
      hook: post.hook,
      script: "",
      caption: "",
      bodyText: post.body,
      hashtags: post.hashtags,
      cta: post.cta,
      generationMetadata: { whyThisShouldWork: post.whyThisShouldWork },
      guardrailText: [post.hook, post.body, post.cta].join("\n"),
      riskNotes: post.riskNotes,
      campaignPlugType: post.campaignPlugType,
    };
  } else {
    throw badRequest(
      `Content type ${request.contentType} is not supported by the generation endpoint yet`,
    );
  }

  const guardrailResult = runGuardrails(
    {
      text: fields.guardrailText,
      riskNotes: fields.riskNotes,
      campaignPlugType: fields.campaignPlugType,
      platform: request.platform,
    },
    guardrailConfig,
  );

  const content = await prisma.generatedContent.create({
    data: {
      personaId,
      campaignId: request.campaignId,
      platform: request.platform,
      contentType: request.contentType,
      status: "PENDING_APPROVAL",
      title: fields.title,
      hook: fields.hook,
      script: fields.script,
      caption: fields.caption,
      bodyText: fields.bodyText,
      hashtags: fields.hashtags,
      cta: fields.cta,
      generationPrompt: userPrompt,
      generationMetadata: {
        ...fields.generationMetadata,
        campaignPlugType: fields.campaignPlugType,
        riskNotes: fields.riskNotes,
        provider: llm.name,
      },
      riskScore: guardrailResult.riskScore,
      guardrailResult: guardrailResult,
      approvals: { create: { status: "PENDING", requestedVia: "api" } },
    },
  });

  if (request.contentType === "SHORT_VIDEO") {
    await prisma.videoAsset.create({
      data: {
        generatedContentId: content.id,
        status: "PENDING",
        storyboardJson: fields.generationMetadata["brollPlan"] ?? undefined,
      },
    });
  }

  return content;
}
