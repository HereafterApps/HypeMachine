import {
  ReplyPlanSchema,
  ShortVideoPlanSchema,
  TextPostPlanSchema,
  type GuardrailResult,
  type ReplyPlan,
  type ShortVideoPlan,
  type TextPostPlan,
} from '@hype/core';
import {
  buildGenerationPrompt,
  buildSystemPrompt,
  type CampaignPromptInput,
  type LlmUsage,
} from '@hype/ai';
import { runGuardrails } from '@hype/guardrails';
import type { Campaign, ContentType, GeneratedContent, Platform } from '@hype/db';
import type { AppContext } from '../context.js';
import { MemoryService } from './memory-service.js';
import { withJobLog } from './job-log.js';
import { buildPolicyFromCampaign, contentPlugType } from './guardrail-policy.js';

export interface GenerateRequest {
  campaignId: string;
  platform: Platform;
  contentType: ContentType;
  extraInstructions?: string;
  scheduledFor?: Date;
  /** For replies: the audience comment/DM being answered (own posts only). */
  replyingTo?: string;
  /**
   * DEBUNK campaigns: the specific claim to debunk, chosen by a human.
   * Required for every DEBUNK generation — topic selection is human-per-item
   * until build-spec §7.1 is resolved.
   */
  claimToDebunk?: string;
}

const PLUG_TARGETS: Record<string, number | null> = {
  EVERY_POST: 100,
  MOST_POSTS: 80,
  HALF_POSTS: 50,
  WHEN_NATURAL: null, // model decides
  OCCASIONAL: 30,
  RARE: 10,
};

export class GenerationService {
  private readonly memory: MemoryService;

  constructor(private readonly ctx: AppContext) {
    this.memory = new MemoryService(ctx);
  }

  async generate(request: GenerateRequest): Promise<{
    content: GeneratedContent;
    guardrails: GuardrailResult;
  }> {
    return withJobLog(
      this.ctx,
      {
        jobName: 'GenerateContentJob',
        campaignId: request.campaignId,
        provider: this.ctx.llm.name,
      },
      async () => {
        const result = await this.generateInner(request);
        return { ...result, costUsd: result.usage.costUsd };
      },
    );
  }

  private async generateInner(request: GenerateRequest): Promise<{
    content: GeneratedContent;
    guardrails: GuardrailResult;
    usage: LlmUsage;
  }> {
    if (request.contentType === 'IMAGE_CAROUSEL') {
      throw new Error('IMAGE_CAROUSEL generation is not implemented yet.');
    }
    const outputKind = request.contentType;
    const campaign = await this.ctx.prisma.campaign.findUniqueOrThrow({
      where: { id: request.campaignId },
      include: { persona: true, guardrailConfig: true, sources: true },
    });
    if (campaign.status !== 'ACTIVE') {
      throw new Error(`Campaign ${campaign.slug} is ${campaign.status}, not ACTIVE.`);
    }
    if (campaign.persona.status !== 'ACTIVE') {
      throw new Error(`Persona ${campaign.persona.slug} is ${campaign.persona.status}, not ACTIVE.`);
    }
    if (campaign.campaignType === 'DEBUNK' && !request.claimToDebunk) {
      throw new Error(
        'DEBUNK generation requires claimToDebunk: a human picks every debunk topic (build-spec §7.1 open decision — conservative default).',
      );
    }
    await this.assertNoCrossPersonaCoordination(campaign);

    const recent = await this.ctx.prisma.generatedContent.findMany({
      where: { campaignId: campaign.id, contentType: request.contentType },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const recentSummaries = recent.map(
      (c) => c.hook ?? c.title ?? c.bodyText?.slice(0, 120) ?? '',
    );
    const includePlug = this.decidePlug(campaign, recent);

    const learnings = await this.ctx.prisma.learningInsight.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const memories = await this.memory.search(
      campaign.personaId,
      `${campaign.productName ?? ''} ${campaign.objective}`,
    );

    const policy = buildPolicyFromCampaign(campaign);
    const campaignPrompt: CampaignPromptInput = {
      name: campaign.name,
      campaignType: campaign.campaignType,
      subject: campaign.subject,
      objective: campaign.objective,
      productName: campaign.productName,
      productDescription: campaign.productDescription,
      productUrl: campaign.productUrl,
      targetAudience: campaign.targetAudience,
      directnessLevel: campaign.directnessLevel,
      plugFrequency: campaign.plugFrequency,
      plugPercentage: campaign.plugPercentage,
      mainMessage: campaign.mainMessage,
      productLine: campaign.productLine,
      sources: campaign.sources.map((s) => ({
        type: s.type,
        title: s.title,
        content: s.content ?? s.url ?? '',
      })),
      allowedClaims: policy.allowedClaims,
      bannedClaims: policy.bannedClaims,
      bannedTopics: policy.bannedTopics,
      learnings: learnings.map((l) => l.insight),
    };

    const systemPrompt = buildSystemPrompt({
      name: campaign.persona.name,
      backstory: campaign.persona.backstory,
      worldview: campaign.persona.worldview,
      speakingStyle: campaign.persona.speakingStyle,
      tone: campaign.persona.tone,
      humorStyle: campaign.persona.humorStyle,
      disclosureText: campaign.persona.disclosureText,
      memoryHighlights: memories.map((m) => ({ type: m.type, content: m.content })),
    });

    const extras = [
      request.extraInstructions,
      request.claimToDebunk
        ? `The specific claim to debunk (human-selected): "${request.claimToDebunk}"`
        : undefined,
      request.replyingTo
        ? `You are replying, as the persona, to this comment on the persona's OWN post:\n"${request.replyingTo}"`
        : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = buildGenerationPrompt({
      campaign: campaignPrompt,
      platform: { platform: request.platform, contentType: request.contentType },
      outputKind,
      extraInstructions: extras || undefined,
      recentContentSummaries: recentSummaries,
      includePlug,
    });

    const { fields, plugType, riskNotes, sourceCitations, metadata, usage } = await this.callModel(
      request.contentType,
      systemPrompt,
      userPrompt,
    );

    const guardrails = runGuardrails(policy, {
      platform: request.platform,
      texts: [
        { label: 'title', value: fields.title ?? '' },
        { label: 'hook', value: fields.hook ?? '' },
        { label: 'script', value: fields.script ?? '' },
        { label: 'caption', value: fields.caption ?? '' },
        { label: 'body', value: fields.bodyText ?? '' },
        { label: 'cta', value: fields.cta ?? '' },
      ].filter((t) => t.value),
      hashtags: fields.hashtags,
      campaignPlugType: plugType,
      riskNotes,
      sourceCitations,
      recentTexts: recent.map((c) =>
        [c.title, c.hook, c.script, c.bodyText].filter(Boolean).join('\n'),
      ),
    });

    const content = await this.ctx.prisma.generatedContent.create({
      data: {
        personaId: campaign.personaId,
        campaignId: campaign.id,
        platform: request.platform,
        contentType: request.contentType,
        status: guardrails.passed ? 'PENDING_APPROVAL' : 'NEEDS_EDIT',
        ...fields,
        sourceCitations,
        generationPrompt: userPrompt,
        generationMetadata: { ...metadata, plugType, usage: { ...usage } },
        riskScore: guardrails.riskScore,
        guardrailResult: JSON.parse(JSON.stringify(guardrails)),
        scheduledFor: request.scheduledFor,
      },
    });

    if (request.contentType === 'SHORT_VIDEO') {
      // Phase-4 slot: storyboard captured now, real avatar/voice/render
      // providers attach later (§3.1 — manual-export stubs only in v1).
      await this.ctx.prisma.videoAsset.create({
        data: {
          generatedContentId: content.id,
          status: 'STORYBOARD',
          provider: 'manual',
          storyboardJson: metadata as object,
        },
      });
    }

    await this.ctx.prisma.approval.create({
      data: {
        generatedContentId: content.id,
        status: 'PENDING',
        requestedVia: 'system',
      },
    });

    const dashboardUrl = `${this.ctx.env.DASHBOARD_BASE_URL}/approvals/${content.id}`;
    await this.ctx.notifier.notify({
      kind: 'APPROVAL_REQUESTED',
      title: `New ${request.contentType} for ${campaign.persona.name} / ${campaign.name}`,
      body: fields.hook ?? fields.bodyText?.slice(0, 200) ?? 'Content ready for review.',
      dashboardUrl,
      approval: {
        contentId: content.id,
        personaName: campaign.persona.name,
        campaignName: campaign.name,
        contentType: request.contentType,
        platform: request.platform,
        hook: fields.hook ?? '',
        riskLevel: guardrails.riskLevel,
        scheduledFor: request.scheduledFor ?? null,
        dashboardUrl,
      },
    });

    return { content, guardrails, usage };
  }

  private async callModel(
    contentType: ContentType,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{
    fields: {
      title?: string;
      hook?: string;
      script?: string;
      caption?: string;
      bodyText?: string;
      hashtags: string[];
      cta?: string;
    };
    plugType: ShortVideoPlan['campaignPlugType'];
    riskNotes: string[];
    sourceCitations: string[];
    metadata: Record<string, unknown>;
    usage: LlmUsage;
  }> {
    switch (contentType) {
      case 'SHORT_VIDEO': {
        const { data, usage } = await this.ctx.llm.generateStructured({
          systemPrompt,
          userPrompt,
          schema: ShortVideoPlanSchema,
        });
        return {
          fields: {
            title: data.title,
            hook: data.hook,
            script: data.script,
            caption: data.caption,
            hashtags: data.hashtags,
            cta: data.cta,
          },
          plugType: data.campaignPlugType,
          riskNotes: data.riskNotes,
          sourceCitations: data.sourceCitations,
          metadata: {
            visualDirection: data.visualDirection,
            cameraStyle: data.cameraStyle,
            outfitSuggestion: data.outfitSuggestion,
            brollPlan: data.brollPlan,
            thumbnailIdea: data.thumbnailIdea,
            whyThisShouldWork: data.whyThisShouldWork,
          },
          usage,
        };
      }
      case 'TEXT_POST':
      case 'THREAD': {
        const { data, usage } = await this.ctx.llm.generateStructured<TextPostPlan>({
          systemPrompt,
          userPrompt,
          schema: TextPostPlanSchema,
        });
        return {
          fields: {
            hook: data.hook,
            bodyText: data.body,
            hashtags: data.hashtags,
            cta: data.cta,
          },
          plugType: data.campaignPlugType,
          riskNotes: data.riskNotes,
          sourceCitations: data.sourceCitations,
          metadata: { whyThisShouldWork: data.whyThisShouldWork },
          usage,
        };
      }
      case 'REPLY':
      case 'DM_REPLY':
      case 'WHATSAPP_MESSAGE': {
        const { data, usage } = await this.ctx.llm.generateStructured<ReplyPlan>({
          systemPrompt,
          userPrompt,
          schema: ReplyPlanSchema,
        });
        return {
          fields: { bodyText: data.reply, hashtags: [] },
          sourceCitations: [],
          plugType: data.shouldMentionCampaign ? 'CASUAL' : 'NONE',
          riskNotes: data.escalateToHuman
            ? [`Escalate to human: ${data.reason}`]
            : data.riskLevel === 'LOW'
              ? []
              : [`Model risk level ${data.riskLevel}: ${data.reason}`],
          metadata: { tone: data.tone, escalateToHuman: data.escalateToHuman, reason: data.reason },
          usage,
        };
      }
      default:
        throw new Error(`Content type ${contentType} is not supported for generation yet.`);
    }
  }

  /**
   * Sockpuppet-coordination guardrail (build-spec §2.4): block generation
   * when a DIFFERENT persona is simultaneously running an active campaign on
   * the same subject — many personas pushing one message simulates organic
   * consensus, which disclosure per-account does not cure.
   */
  private async assertNoCrossPersonaCoordination(campaign: Campaign) {
    const subject = (campaign.subject ?? campaign.productName ?? '').trim().toLowerCase();
    if (!subject) return;
    const overlapping = await this.ctx.prisma.campaign.findMany({
      where: {
        id: { not: campaign.id },
        personaId: { not: campaign.personaId },
        status: 'ACTIVE',
      },
      select: { subject: true, productName: true, persona: { select: { name: true } } },
    });
    const conflicts = overlapping.filter(
      (c) => ((c.subject ?? c.productName ?? '').trim().toLowerCase() || null) === subject,
    );
    if (conflicts.length > 0) {
      throw new Error(
        `Coordination guardrail (§2.4): persona(s) ${conflicts
          .map((c) => `"${c.persona.name}"`)
          .join(', ')} already run an ACTIVE campaign on subject "${subject}". ` +
          `Multiple personas must not push the same message simultaneously — pause one campaign first.`,
      );
    }
  }

  /** Deterministic plug pacing toward the campaign's target ratio. */
  private decidePlug(campaign: Campaign, recent: GeneratedContent[]): boolean | undefined {
    const target =
      campaign.plugFrequency === 'CUSTOM_PERCENTAGE'
        ? (campaign.plugPercentage ?? 50)
        : PLUG_TARGETS[campaign.plugFrequency];
    if (target == null) return undefined; // WHEN_NATURAL — model decides
    if (recent.length === 0) return true;
    const plugged = recent.filter((c) => contentPlugType(c) !== 'NONE').length;
    return (plugged / recent.length) * 100 < target;
  }
}
