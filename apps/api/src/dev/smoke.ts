// End-to-end pipeline smoke test using a stubbed LLM provider.
// Requires a running database with the seed applied. Run: pnpm smoke
import "../lib/env.js";
import { getPrisma } from "@hype/db";
import { generateContent, setLlmProvider } from "../services/generation.js";
import { applyApprovalAction } from "../services/approvals.js";

const prisma = getPrisma();

setLlmProvider({
  name: "stub",
  async generateStructured({ schema }) {
    // Deliberately trips a banned claim ("Guaranteed marks improvement")
    // so the guardrail pass is exercised.
    const textPost = {
      body: "I'm 80 and this app made me jealous. GuidedGenius actually talks the student through the problem. Guaranteed marks improvement, obviously. I'm not even the target audience.",
      hook: "I'm 80 and this app made me jealous.",
      cta: "Try GuidedGenius if you want learning to feel less passive.",
      hashtags: ["edtech", "learning"],
      campaignPlugType: "CASUAL",
      whyThisShouldWork: "Age-contrast hook + casual plug.",
      riskNotes: ["Contains a strong product claim."],
    };
    return schema.parse(textPost);
  },
});

const campaign = await prisma.campaign.findUniqueOrThrow({
  where: { slug: "guidedgenius" },
});

// 1. Generate — should land PENDING_APPROVAL with guardrail blockers recorded
const content = await generateContent({
  campaignId: campaign.id,
  contentType: "TEXT_POST",
  platform: "X",
});
console.log("generated:", content.id, content.status, "risk:", content.riskScore);
console.log("guardrails:", JSON.stringify(content.guardrailResult));

// 2. Reject it with a reason — should write a persona memory
const rejected = await applyApprovalAction(content.id, {
  action: "REJECT",
  reason: "Contains the banned 'guaranteed marks' claim.",
});
console.log("after reject:", rejected.status);

const memory = await prisma.personaMemory.findFirst({
  where: { source: "approval-rejection" },
  orderBy: { createdAt: "desc" },
});
console.log("rejection memory created:", memory?.title);

// 3. Generate again and approve
const content2 = await generateContent({
  campaignId: campaign.id,
  contentType: "TEXT_POST",
  platform: "X",
});
const approved = await applyApprovalAction(content2.id, { action: "APPROVE" });
console.log("after approve:", approved.status);

// 4. Regenerate quick-action produces a fresh item and archives the old one
const content3 = await generateContent({
  campaignId: campaign.id,
  contentType: "TEXT_POST",
  platform: "X",
});
const regenerated = await applyApprovalAction(content3.id, {
  action: "MAKE_MORE_SUBTLE",
});
console.log(
  "regenerate created new item:",
  regenerated.id !== content3.id,
  "status:",
  regenerated.status,
);

const counts = await prisma.generatedContent.groupBy({
  by: ["status"],
  _count: true,
});
console.log("content by status:", JSON.stringify(counts));
await prisma.$disconnect();
