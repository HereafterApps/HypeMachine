// Prompt builders (plan §8). The AI receives persona context, campaign
// context, and platform context, then a task instruction. Output shape is
// enforced by structured outputs at the provider layer.

export interface PersonaContext {
  name: string;
  personaType: string;
  description: string;
  backstory: string;
  worldview: string;
  speakingStyle: string;
  tone: string;
  humorStyle: string;
  disclosureText: string;
  defaultLanguage: string;
  memoryHighlights: Array<{ type: string; title: string; content: string }>;
}

export interface CampaignContext {
  name: string;
  campaignType: string;
  objective: string;
  targetAudience: string;
  productName: string;
  productDescription: string;
  productUrl?: string | null;
  directnessLevel: string;
  plugFrequency: string;
  plugPercentage?: number | null;
  allowedClaims: string[];
  bannedClaims: string[];
  sources: Array<{ type: string; title: string; content: string }>;
  recentLearnings: string[];
}

export interface PlatformContext {
  platform: string;
  contentType: string;
  maxLength?: number;
  conventions?: string;
}

const PLATFORM_NOTES: Record<string, string> = {
  X: "Max 280 characters for a single post. Punchy, conversational, minimal hashtags (0-2).",
  YOUTUBE:
    "Shorts: vertical 9:16, hook in the first 2 seconds, 20-45s total. Title <= 100 chars.",
  TIKTOK: "Vertical 9:16, fast cuts, native tone, trend-aware. 15-60s.",
  INSTAGRAM:
    "Reels: vertical 9:16. Captions can be longer; front-load the first line. Up to ~10 relevant hashtags.",
  LINKEDIN:
    "Professional but human tone. Longer text posts perform well. Minimal hashtags (~3).",
  THREADS: "Casual, conversational. 500 char limit per post.",
  FACEBOOK: "Conversational, shareable. Avoid hashtag stuffing.",
  WHATSAPP:
    "Opted-in broadcast message. Personal, concise, single clear CTA. Never write cold-outreach copy.",
  MANUAL_EXPORT: "Will be exported manually; follow the target platform's norms.",
};

export function buildSystemPrompt(persona: PersonaContext): string {
  const memories = persona.memoryHighlights
    .map((m) => `- [${m.type}] ${m.title}: ${m.content}`)
    .join("\n");

  return [
    `You are the content engine for "${persona.name}", a ${persona.personaType} virtual persona.`,
    ``,
    `## Persona`,
    `Description: ${persona.description}`,
    `Backstory: ${persona.backstory}`,
    `Worldview: ${persona.worldview}`,
    `Speaking style: ${persona.speakingStyle}`,
    `Tone: ${persona.tone}`,
    `Humor style: ${persona.humorStyle}`,
    `Language: ${persona.defaultLanguage}`,
    ``,
    `## Memory highlights`,
    memories || "(none yet)",
    ``,
    `## Non-negotiable rules`,
    `- This persona is a DISCLOSED virtual/AI creator. Its public disclosure text is: "${persona.disclosureText}". Never write content that denies or hides that the persona is virtual/AI-driven.`,
    `- The persona only speaks as itself on its own channels. Never write content that impersonates an independent human user, a customer, or a reviewer.`,
    `- Never fabricate factual claims, statistics, endorsements, or testimonials.`,
    `- Stay in character: consistent voice, recurring phrases, and personality.`,
    `- Content goes to a human approval queue before publishing; write your honest best attempt, and surface anything risky in riskNotes.`,
  ].join("\n");
}

export function buildCampaignBlock(campaign: CampaignContext): string {
  const sources = campaign.sources
    .map((s) => `- [${s.type}] ${s.title}: ${s.content.slice(0, 2000)}`)
    .join("\n");
  const learnings = campaign.recentLearnings.map((l) => `- ${l}`).join("\n");

  return [
    `## Campaign: ${campaign.name} (${campaign.campaignType})`,
    `Objective: ${campaign.objective}`,
    `Target audience: ${campaign.targetAudience}`,
    `Product/topic: ${campaign.productName} — ${campaign.productDescription}`,
    campaign.productUrl ? `URL: ${campaign.productUrl}` : ``,
    `Directness level: ${campaign.directnessLevel}`,
    `Plug frequency: ${campaign.plugFrequency}${campaign.plugPercentage != null ? ` (${campaign.plugPercentage}%)` : ""}`,
    ``,
    `Allowed claims (only these product claims may be made):`,
    campaign.allowedClaims.map((c) => `- ${c}`).join("\n") || "- (none defined)",
    ``,
    `Banned claims (never state or imply):`,
    campaign.bannedClaims.map((c) => `- ${c}`).join("\n") || "- (none defined)",
    ``,
    `Source material:`,
    sources || "(none)",
    ``,
    `Recent performance learnings:`,
    learnings || "(none yet)",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPlatformBlock(platform: PlatformContext): string {
  return [
    `## Platform: ${platform.platform} / ${platform.contentType}`,
    PLATFORM_NOTES[platform.platform] ?? "",
    platform.conventions ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTextPostPrompt(
  campaign: CampaignContext,
  platform: PlatformContext,
  instruction?: string,
): string {
  return [
    buildCampaignBlock(campaign),
    ``,
    buildPlatformBlock(platform),
    ``,
    `## Task`,
    `Write one ${platform.platform} text post for this campaign, in the persona's voice.`,
    `Decide the plug type per the campaign's directness/frequency settings; NONE is a valid choice when a plug would feel forced.`,
    instruction ? `Additional instruction: ${instruction}` : ``,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildShortVideoPrompt(
  campaign: CampaignContext,
  platform: PlatformContext,
  instruction?: string,
): string {
  return [
    buildCampaignBlock(campaign),
    ``,
    buildPlatformBlock(platform),
    ``,
    `## Task`,
    `Plan one short vertical video (20-45 seconds) for this campaign, in the persona's voice:`,
    `- a 1-2 second hook`,
    `- short setup, main point, a personality moment`,
    `- campaign plug per the directness/frequency settings (NONE is valid)`,
    `- a CTA`,
    `- a b-roll plan with timestamps and sources`,
    instruction ? `Additional instruction: ${instruction}` : ``,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReplyPrompt(
  campaign: CampaignContext,
  platform: PlatformContext,
  originalComment: string,
  instruction?: string,
): string {
  return [
    buildCampaignBlock(campaign),
    ``,
    buildPlatformBlock(platform),
    ``,
    `## Task`,
    `Draft a reply, as the persona's own channel, to this comment on the persona's own post:`,
    `"""${originalComment}"""`,
    `Set escalateToHuman=true for anything legal, medical, financial, safety-related, or hostile.`,
    instruction ? `Additional instruction: ${instruction}` : ``,
  ]
    .filter(Boolean)
    .join("\n");
}
