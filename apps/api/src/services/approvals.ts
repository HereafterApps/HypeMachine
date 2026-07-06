import type { ApprovalActionInput } from "@hype/core";
import { getPrisma, type GeneratedContent } from "@hype/db";
import { badRequest, notFound } from "../lib/errors.js";
import { generateContent } from "./generation.js";

const REGENERATE_INSTRUCTIONS: Record<string, string> = {
  REGENERATE: "Produce a fresh take on the same brief.",
  MAKE_FUNNIER: "Make it noticeably funnier while staying in character.",
  MAKE_SHORTER: "Make it significantly shorter and tighter.",
  MAKE_MORE_SUBTLE: "Make the campaign plug more subtle (or drop it).",
  MAKE_MORE_DIRECT: "Make the campaign plug more direct, with a clearer CTA.",
  CHANGE_HOOK: "Keep the substance but write a completely different hook.",
  CHANGE_CTA: "Keep the substance but change the CTA approach.",
  CHANGE_VISUAL_STYLE: "Keep the message but propose a different visual style.",
  CHANGE_PLATFORM:
    "Adapt this content for the new target platform, following its conventions.",
};

// Statuses a reviewer is allowed to act on. Acting on APPROVED/SCHEDULED/
// PUBLISHED/ARCHIVED content would corrupt the lifecycle (e.g. rewriting a
// post that is already live).
const REVIEWABLE_STATUSES = new Set([
  "DRAFT_GENERATED",
  "PENDING_APPROVAL",
  "NEEDS_EDIT",
]);

/**
 * Approval workflow (plan §11). Approving marks content APPROVED (or
 * SCHEDULED when scheduledFor is set); actual publishing is a separate,
 * explicit step handled by the publishing module.
 */
export async function applyApprovalAction(
  contentId: string,
  input: ApprovalActionInput,
  userId?: string,
): Promise<GeneratedContent> {
  const prisma = getPrisma();
  const content = await prisma.generatedContent.findUnique({
    where: { id: contentId },
  });
  if (!content) throw notFound("Generated content");
  if (!REVIEWABLE_STATUSES.has(content.status)) {
    throw badRequest(`Cannot apply ${input.action} to content in status ${content.status}`);
  }

  if (input.action === "APPROVE") {
    const scheduledFor = input.edits?.scheduledFor ?? content.scheduledFor;
    // Guard the transition on the previously-read status so a concurrent
    // action on the same row loses instead of silently double-applying.
    const { count } = await prisma.generatedContent.updateMany({
      where: { id: contentId, status: content.status },
      data: { status: scheduledFor ? "SCHEDULED" : "APPROVED", scheduledFor },
    });
    if (count === 0) {
      throw badRequest("Content was modified concurrently; reload and retry");
    }
    await prisma.approval.updateMany({
      where: { generatedContentId: contentId, status: "PENDING" },
      data: {
        status: "APPROVED",
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
    });
    return prisma.generatedContent.findUniqueOrThrow({ where: { id: contentId } });
  }

  if (input.action === "REJECT") {
    const { count } = await prisma.generatedContent.updateMany({
      where: { id: contentId, status: content.status },
      data: { status: "REJECTED" },
    });
    if (count === 0) {
      throw badRequest("Content was modified concurrently; reload and retry");
    }
    await prisma.approval.updateMany({
      where: { generatedContentId: contentId, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectionReason: input.reason ?? null,
        rejectedAt: new Date(),
      },
    });
    // Rejections become persona memory so future generations learn (§11.3).
    if (input.reason) {
      await prisma.personaMemory.create({
        data: {
          personaId: content.personaId,
          type: "FAILED_HOOK",
          title: `Rejected ${content.contentType} on ${content.platform}`,
          content: `Hook: ${content.hook || content.title}\nRejection reason: ${input.reason}`,
          importance: 0.6,
          source: "approval-rejection",
        },
      });
    }
    return prisma.generatedContent.findUniqueOrThrow({ where: { id: contentId } });
  }

  if (input.action === "EDIT") {
    if (!input.edits) throw badRequest("EDIT action requires an edits object");
    const { scheduledFor, ...textEdits } = input.edits;
    return prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        ...textEdits,
        scheduledFor,
        status: "PENDING_APPROVAL",
        approvals: {
          updateMany: {
            where: { status: "PENDING" },
            data: { status: "EDITED", editInstruction: input.editInstruction ?? null },
          },
          // Fresh PENDING approval so the edited version still gets an
          // explicit human sign-off recorded before it can be approved.
          create: { status: "PENDING", requestedVia: "edit" },
        },
      },
    });
  }

  // All remaining actions are regeneration variants.
  const baseInstruction = REGENERATE_INSTRUCTIONS[input.action];
  if (!baseInstruction) throw badRequest(`Unsupported action ${input.action}`);

  const instruction = [
    baseInstruction,
    input.editInstruction ?? "",
    `Previous version for reference (do not repeat it):`,
    content.bodyText || content.script || content.caption,
  ]
    .filter(Boolean)
    .join("\n");

  // Generate the replacement FIRST; only archive the original once the
  // replacement exists. An LLM failure must never destroy the only draft.
  const replacement = await generateContent({
    campaignId: content.campaignId,
    contentType: content.contentType,
    platform: input.platform ?? content.platform,
    instruction,
  });

  await prisma.generatedContent.update({
    where: { id: contentId },
    data: {
      status: "ARCHIVED",
      approvals: {
        updateMany: {
          where: { status: "PENDING" },
          data: { status: "REGENERATED", editInstruction: input.editInstruction ?? null },
        },
      },
    },
  });

  return replacement;
}
