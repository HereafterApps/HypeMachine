import type { ContentType, DirectnessLevel, Platform, PlugFrequency } from '@hype/core';

export const OUTPUT_KIND_MARKER = '## Output kind:';

/**
 * Prompt context builders (product-plan §8). These take plain data shapes so
 * the package has no dependency on the database layer.
 */

export interface PersonaPromptInput {
  name: string;
  backstory: string;
  worldview: string;
  speakingStyle: string;
  tone: string;
  humorStyle: string;
  disclosureText: string;
  memoryHighlights: { type: string; content: string }[];
}

export interface CampaignPromptInput {
  name: string;
  campaignType: string;
  objective: string;
  subject?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  productUrl?: string | null;
  targetAudience?: string | null;
  directnessLevel: DirectnessLevel;
  plugFrequency: PlugFrequency;
  plugPercentage?: number | null;
  mainMessage?: string | null;
  productLine?: string | null;
  sources: { type: string; title: string; content: string }[];
  allowedClaims: string[];
  bannedClaims: string[];
  bannedTopics: string[];
  learnings: string[];
}

export interface PlatformPromptInput {
  platform: Platform;
  contentType: ContentType;
}

const PLATFORM_CONVENTIONS: Partial<Record<Platform, string>> = {
  YOUTUBE:
    'YouTube Shorts: vertical 9:16, 20–45s, strong 1–2 second hook, captions on, max ~100-char title. Mark as AI/synthetic content per YouTube disclosure tools.',
  X: 'X: max 280 chars per post, punchy first line, at most 1–2 hashtags, links allowed. Conversational, a little spicy is fine.',
  TIKTOK:
    'TikTok: vertical 9:16, fast cuts, native text overlays, trending-sound friendly. Use AI-generated content label.',
  INSTAGRAM:
    'Instagram Reels: vertical 9:16, caption up to 2200 chars but front-load first 125, 3–5 hashtags.',
  LINKEDIN:
    'LinkedIn: professional but personal, short paragraphs, no more than 3 hashtags, no engagement bait.',
  MANUAL_EXPORT: 'Manual export bundle: platform-neutral formatting; operator will adapt per platform.',
};

export function buildPersonaContext(persona: PersonaPromptInput): string {
  const memories = persona.memoryHighlights
    .map((m) => `- [${m.type}] ${m.content}`)
    .join('\n');
  return [
    `# Persona`,
    `Name: ${persona.name}`,
    `Backstory: ${persona.backstory}`,
    `Worldview: ${persona.worldview}`,
    `Speaking style: ${persona.speakingStyle}`,
    `Tone: ${persona.tone}`,
    `Humor: ${persona.humorStyle}`,
    `Disclosure: this persona is openly virtual/AI-driven ("${persona.disclosureText}"). Never pretend to be a real human being; never deny being an AI persona if asked.`,
    memories ? `Memory highlights:\n${memories}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Type-specific rules (build-spec §2.6) injected into every generation. */
const CAMPAIGN_TYPE_RULES: Record<string, string> = {
  DEBUNK: [
    'DEBUNK rules (non-negotiable):',
    '- Address ONE specific claim. End at "is this specific claim accurate?".',
    '- NEVER conclude with support/oppose/vote/which-side-is-right — that is advocacy and is blocked.',
    '- Target the claim, never a person\'s character or a party.',
    '- Cite at least one primary source in sourceCitations (URL or precise reference).',
    '- The correction must be verifiable: someone who dislikes the conclusion should still agree the correction itself is factually accurate.',
  ].join('\n'),
  CIVIC_MECHANICS: [
    'CIVIC_MECHANICS rules (non-negotiable):',
    '- Explain how a civic process works (e.g. how ranked-choice voting counts ballots).',
    '- Strictly neutral: no advocacy for any candidate, party, side, or outcome.',
    '- Prefer citing official/primary sources in sourceCitations.',
  ].join('\n'),
  MEDIA_LITERACY: [
    'MEDIA_LITERACY rules:',
    '- Teach evaluation skills; never tell the audience what to believe about a contested political question.',
  ].join('\n'),
};

export function buildCampaignContext(campaign: CampaignPromptInput): string {
  const plug =
    campaign.plugFrequency === 'CUSTOM_PERCENTAGE'
      ? `${campaign.plugPercentage ?? 50}% of posts mention the product`
      : campaign.plugFrequency;
  const sources = campaign.sources
    .map((s) => `- [${s.type}] ${s.title}: ${s.content.slice(0, 500)}`)
    .join('\n');
  const learnings = campaign.learnings.map((l) => `- ${l}`).join('\n');
  return [
    `# Campaign`,
    `Name: ${campaign.name}`,
    `Type: ${campaign.campaignType}`,
    `Goal: ${campaign.objective}`,
    campaign.subject ? `Subject: ${campaign.subject}` : '',
    CAMPAIGN_TYPE_RULES[campaign.campaignType] ?? '',
    campaign.productName ? `Product: ${campaign.productName} — ${campaign.productDescription ?? ''}` : '',
    campaign.productUrl ? `URL: ${campaign.productUrl}` : '',
    campaign.targetAudience ? `Target audience: ${campaign.targetAudience}` : '',
    `Directness level: ${campaign.directnessLevel}`,
    `Plug frequency: ${plug}`,
    campaign.mainMessage ? `Main message: ${campaign.mainMessage}` : '',
    campaign.productLine ? `Product mention style: ${campaign.productLine}` : '',
    campaign.allowedClaims.length
      ? `Allowed claims (stay inside these):\n${campaign.allowedClaims.map((c) => `- ${c}`).join('\n')}`
      : '',
    campaign.bannedClaims.length
      ? `Banned claims (never state or imply):\n${campaign.bannedClaims.map((c) => `- ${c}`).join('\n')}`
      : '',
    campaign.bannedTopics.length
      ? `Banned topics:\n${campaign.bannedTopics.map((t) => `- ${t}`).join('\n')}`
      : '',
    sources ? `Source material:\n${sources}` : '',
    learnings ? `Recent performance learnings (adapt to these):\n${learnings}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPlatformContext(input: PlatformPromptInput): string {
  return [
    `# Platform`,
    `Platform: ${input.platform}`,
    `Content format: ${input.contentType}`,
    PLATFORM_CONVENTIONS[input.platform] ?? 'Follow general social-media best practices.',
  ].join('\n');
}

export function buildSystemPrompt(persona: PersonaPromptInput): string {
  return [
    `You are the content engine for a disclosed virtual creator ("persona"). You write content that the`,
    `persona will publish on its own channels. Rules that always apply:`,
    `- The persona is openly AI/virtual. Content must never claim or imply it is a real human.`,
    `- Content is published only on the persona's own channels; it never poses as an independent user elsewhere.`,
    `- Stay inside the campaign's allowed claims; never state banned claims even indirectly.`,
    `- Every piece of content goes through human approval before publishing — flag anything risky in riskNotes.`,
    ``,
    buildPersonaContext(persona),
  ].join('\n');
}

export interface GenerationPromptInput {
  campaign: CampaignPromptInput;
  platform: PlatformPromptInput;
  outputKind:
    | 'SHORT_VIDEO'
    | 'TEXT_POST'
    | 'THREAD'
    | 'REPLY'
    | 'DM_REPLY'
    | 'WHATSAPP_MESSAGE'
    | 'LEARNING_INSIGHT';
  extraInstructions?: string;
  recentContentSummaries?: string[];
  /** Whether this piece should include the campaign plug (rolled upstream). */
  includePlug?: boolean;
}

export function buildGenerationPrompt(input: GenerationPromptInput): string {
  const recent = (input.recentContentSummaries ?? [])
    .map((s) => `- ${s}`)
    .join('\n');
  return [
    buildCampaignContext(input.campaign),
    '',
    buildPlatformContext(input.platform),
    '',
    recent ? `# Recent content (do not duplicate these):\n${recent}\n` : '',
    input.includePlug === false
      ? 'For THIS piece: do NOT plug the product. Pure value/personality content (campaignPlugType must be NONE).'
      : 'For THIS piece: include the campaign plug at the configured directness level.',
    input.extraInstructions ? `# Extra instructions\n${input.extraInstructions}` : '',
    '',
    `${OUTPUT_KIND_MARKER} ${input.outputKind}`,
    `Respond with a single JSON object matching the requested schema.`,
  ]
    .filter(Boolean)
    .join('\n');
}
