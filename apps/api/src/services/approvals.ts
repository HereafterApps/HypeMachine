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
};

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

  if (input.action === "APPROVE") {
    if (
      content.status !== "PENDING_APPROVAL" &&
      content.status !== "NEEDS_EDIT" &&
      content.status !== "DRAFT_GENERATED"
    ) {
      throw badRequest(`Cannot approve content in status ${content.status}`);
    }
    const scheduledFor = input.edits?.scheduledFor ?? content.scheduledFor;
    const updated = await prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        status: scheduledFor ? "SCHEDULED" : "APPROVED",
        scheduledFor,
        approvals: {
          updateMany: {
            where: { status: "PENDING" },
            data: {
              status: "APPROVED",
              approvedByUserId: userId,
              approvedAt: new Date(),
            },
          },
        },
      },
    });
    return updated;
  }

  if (input.action === "REJECT") {
    const updated = await prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        status: "REJECTED",
        approvals: {
          updateMany: {
            where: { status: "PENDING" },
            data: {
              status: "REJECTED",
              rejectionReason: input.reason ?? null,
              rejectedAt: new Date(),
            },
          },
        },
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
    return updated;
  }

  if (input.action === "EDIT") {
    if (!input.edits) throw badRequest("EDIT action requires an edits object");
    const { scheduledFor, ...textEdits } = input.edits;
    const updated = await prisma.generatedContent.update({
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
        },
      },
    });
    return updated;
  }

  // All remaining actions are regeneration variants.
  const baseInstruction = REGENERATE_INSTRUCTIONS[input.action];
  if (!baseInstruction) throw badRequest(`Unsupported action ${input.action}`);

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

  const instruction = [
    baseInstruction,
    input.editInstruction ?? "",
    `Previous version for reference (do not repeat it):`,
    content.bodyText || content.script || content.caption,
  ]
    .filter(Boolean)
    .join("\n");

  return generateContent({
    campaignId: content.campaignId,
    contentType: content.contentType,
    platform: content.platform,
    instruction,
  });
}
