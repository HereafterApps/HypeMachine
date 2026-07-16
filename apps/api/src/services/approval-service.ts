import type { GuardrailResult } from '@hype/core';
import type { AppContext } from '../context.js';
import { GenerationService } from './generation-service.js';
import { PublishingService } from './publishing-service.js';
import { buildPolicyFromCampaign, evaluateContentFields } from './guardrail-policy.js';

const QUICK_ACTION_INSTRUCTIONS: Record<string, string> = {
  REGENERATE: 'Produce a fresh take on the same brief.',
  MAKE_FUNNIER: 'Make it noticeably funnier while staying in persona.',
  MAKE_SHORTER: 'Make it significantly shorter and punchier.',
  MAKE_MORE_SUBTLE: 'Make any product mention more subtle (or drop it).',
  MAKE_MORE_DIRECT: 'Make the product mention more direct and confident.',
  CHANGE_HOOK: 'Keep the substance but write a completely different hook.',
  CHANGE_CTA: 'Keep the content but change the call to action.',
  CHANGE_VISUAL_STYLE: 'Keep the script but propose a different visual treatment.',
};

/** Approval workflow (product-plan §7.5, §11). Human approval is mandatory. */
export class ApprovalService {
  private readonly publishing: PublishingService;
  private readonly generation: GenerationService;

  constructor(private readonly ctx: AppContext) {
    this.publishing = new PublishingService(ctx);
    this.generation = new GenerationService(ctx);
  }

  private async loadContent(contentId: string) {
    return this.ctx.prisma.generatedContent.findUniqueOrThrow({
      where: { id: contentId },
    });
  }

  async approve(contentId: string, userId?: string) {
    const content = await this.loadContent(contentId);
    if (content.status !== 'PENDING_APPROVAL') {
      throw new Error(`Content is ${content.status}; only PENDING_APPROVAL can be approved.`);
    }
    const guardrails = content.guardrailResult as unknown as GuardrailResult | null;
    if (guardrails && guardrails.blockers.length > 0) {
      throw new Error(
        `Content has guardrail blockers and cannot be approved: ${guardrails.blockers.join('; ')}`,
      );
    }

    await this.ctx.prisma.approval.updateMany({
      where: { generatedContentId: contentId, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        action: 'APPROVE',
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
    });

    const scheduled = content.scheduledFor && content.scheduledFor.getTime() > Date.now();
    const updated = await this.ctx.prisma.generatedContent.update({
      where: { id: contentId },
      data: { status: scheduled ? 'SCHEDULED' : 'APPROVED' },
    });

    // §11.2: no future schedule → publish immediately.
    if (!scheduled) {
      await this.publishing.publish(contentId);
      return this.loadContent(contentId);
    }
    return updated;
  }

  async reject(contentId: string, reason: string, userId?: string) {
    const content = await this.loadContent(contentId);
    if (!['PENDING_APPROVAL', 'NEEDS_EDIT'].includes(content.status)) {
      throw new Error(`Content is ${content.status}; cannot reject.`);
    }
    await this.ctx.prisma.approval.updateMany({
      where: { generatedContentId: contentId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        action: 'REJECT',
        approvedByUserId: userId,
        rejectionReason: reason,
        rejectedAt: new Date(),
      },
    });
    const updated = await this.ctx.prisma.generatedContent.update({
      where: { id: contentId },
      data: { status: 'REJECTED' },
    });
    // §11.3: rejections become learning memory.
    if (content.hook) {
      await this.ctx.prisma.personaMemory.create({
        data: {
          personaId: content.personaId,
          type: 'FAILED_HOOK',
          title: `Rejected: ${content.hook.slice(0, 60)}`,
          content: `Hook "${content.hook}" was rejected by reviewer. Reason: ${reason}`,
          importance: 0.6,
          source: 'approval-rejection',
        },
      });
    }
    return updated;
  }

  async edit(
    contentId: string,
    edits: {
      title?: string;
      hook?: string;
      script?: string;
      caption?: string;
      bodyText?: string;
      hashtags?: string[];
      cta?: string;
      scheduledFor?: Date | null;
      editInstruction?: string;
    },
    userId?: string,
  ) {
    const content = await this.loadContent(contentId);
    if (!['PENDING_APPROVAL', 'NEEDS_EDIT', 'REJECTED'].includes(content.status)) {
      throw new Error(`Content is ${content.status}; cannot edit.`);
    }
    const { editInstruction, ...fields } = edits;
    await this.ctx.prisma.approval.updateMany({
      where: { generatedContentId: contentId, status: 'PENDING' },
      data: { status: 'NEEDS_EDIT', action: 'EDIT', approvedByUserId: userId, editInstruction },
    });

    // Re-run guardrails against the edited text (§11.4) so a bad edit can't
    // sneak past the checks that ran at generation time.
    const merged = { ...content, ...Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    ) };
    const campaign = await this.ctx.prisma.campaign.findUniqueOrThrow({
      where: { id: content.campaignId },
      include: { guardrailConfig: true },
    });
    const guardrails = evaluateContentFields(buildPolicyFromCampaign(campaign), {
      platform: content.platform,
      title: merged.title,
      hook: merged.hook,
      script: merged.script,
      caption: merged.caption,
      bodyText: merged.bodyText,
      cta: merged.cta,
      hashtags: merged.hashtags ?? content.hashtags,
    });

    const updated = await this.ctx.prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
        riskScore: guardrails.riskScore,
        guardrailResult: JSON.parse(JSON.stringify(guardrails)),
        status: guardrails.passed ? 'PENDING_APPROVAL' : 'NEEDS_EDIT',
      },
    });
    // Fresh pending approval for the edited version.
    await this.ctx.prisma.approval.create({
      data: { generatedContentId: contentId, status: 'PENDING', requestedVia: 'edit' },
    });
    return updated;
  }

  /** Quick actions (§11.5) — archives the old item, generates a fresh one. */
  async regenerate(contentId: string, action: string, instruction?: string, userId?: string) {
    const content = await this.loadContent(contentId);
    const extra =
      instruction ??
      QUICK_ACTION_INSTRUCTIONS[action] ??
      QUICK_ACTION_INSTRUCTIONS.REGENERATE!;

    await this.ctx.prisma.approval.updateMany({
      where: { generatedContentId: contentId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        action,
        approvedByUserId: userId,
        editInstruction: extra,
        rejectedAt: new Date(),
      },
    });
    await this.ctx.prisma.generatedContent.update({
      where: { id: contentId },
      data: { status: 'ARCHIVED' },
    });

    const previous = [content.title, content.hook, content.bodyText]
      .filter(Boolean)
      .join(' / ')
      .slice(0, 300);
    return this.generation.generate({
      campaignId: content.campaignId,
      platform: content.platform,
      contentType: content.contentType,
      scheduledFor: content.scheduledFor ?? undefined,
      extraInstructions: `${extra}\nThe previous draft was: "${previous}". Produce a replacement, not a copy.`,
    });
  }
}
