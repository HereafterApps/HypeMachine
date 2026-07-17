import { describe, expect, it } from 'vitest';
import {
  LearningInsightPlanSchema,
  ReplyPlanSchema,
  ShortVideoPlanSchema,
  TextPostPlanSchema,
} from '@hype/core';
import {
  StubLlmProvider,
  buildGenerationPrompt,
  buildSystemPrompt,
  createLlmProvider,
} from '../src/index.js';

const persona = {
  name: 'Professor Steve',
  backstory: 'Retired professor.',
  worldview: 'Learning should be interactive.',
  speakingStyle: 'short sentences',
  tone: 'warm, blunt',
  humorStyle: 'dry',
  disclosureText: 'Virtual AI-driven professor character.',
  memoryHighlights: [{ type: 'RECURRING_JOKE', content: 'Not even the target audience.' }],
};

const campaign = {
  name: 'GuidedGenius',
  campaignType: 'PRODUCT_HYPE',
  objective: 'Awareness',
  productName: 'GuidedGenius',
  productDescription: 'AI tutoring app',
  productUrl: 'https://guidedgenius.com',
  targetAudience: 'parents',
  directnessLevel: 'CASUAL' as const,
  plugFrequency: 'CUSTOM_PERCENTAGE' as const,
  plugPercentage: 60,
  mainMessage: 'Learning should be interactive.',
  productLine: 'Damn, it is awesome.',
  sources: [{ type: 'PRODUCT_DOC', title: 'Overview', content: 'Tutoring app.' }],
  allowedClaims: ['GuidedGenius helps make learning interactive.'],
  bannedClaims: ['guaranteed marks improvement'],
  bannedTopics: ['medical claims'],
  learnings: [],
};

function prompt(kind: 'SHORT_VIDEO' | 'TEXT_POST' | 'REPLY' | 'LEARNING_INSIGHT') {
  return buildGenerationPrompt({
    campaign,
    platform: { platform: 'YOUTUBE', contentType: 'SHORT_VIDEO' },
    outputKind: kind,
  });
}

describe('StubLlmProvider', () => {
  const stub = new StubLlmProvider();
  const system = buildSystemPrompt(persona);

  it('produces schema-valid short video plans', async () => {
    const result = await stub.generateStructured({
      systemPrompt: system,
      userPrompt: prompt('SHORT_VIDEO'),
      schema: ShortVideoPlanSchema,
    });
    expect(result.data.hook.length).toBeGreaterThan(0);
    expect(result.data.brollPlan.length).toBeGreaterThan(0);
  });

  it('produces schema-valid text posts, replies and insights', async () => {
    const post = await stub.generateStructured({
      systemPrompt: system,
      userPrompt: prompt('TEXT_POST'),
      schema: TextPostPlanSchema,
    });
    expect(post.data.body.length).toBeGreaterThan(0);

    const reply = await stub.generateStructured({
      systemPrompt: system,
      userPrompt: prompt('REPLY'),
      schema: ReplyPlanSchema,
    });
    expect(reply.data.riskLevel).toBe('LOW');

    const insight = await stub.generateStructured({
      systemPrompt: system,
      userPrompt: prompt('LEARNING_INSIGHT'),
      schema: LearningInsightPlanSchema,
    });
    expect(insight.data.confidence).toBeGreaterThan(0);
  });

  it('varies output across consecutive calls', async () => {
    const a = await stub.generateStructured({
      systemPrompt: system,
      userPrompt: prompt('TEXT_POST'),
      schema: TextPostPlanSchema,
    });
    const b = await stub.generateStructured({
      systemPrompt: system,
      userPrompt: prompt('TEXT_POST'),
      schema: TextPostPlanSchema,
    });
    expect(a.data.body).not.toBe(b.data.body);
  });

  it('produces cited, advocacy-free content for DEBUNK campaigns', async () => {
    const debunkPrompt = buildGenerationPrompt({
      campaign: { ...campaign, campaignType: 'DEBUNK', subject: 'edited classroom clip' },
      platform: { platform: 'X', contentType: 'TEXT_POST' },
      outputKind: 'TEXT_POST',
      extraInstructions: `The specific claim to debunk (human-selected): "the clip shows a full lesson"`,
      includePlug: false,
    });
    expect(debunkPrompt).toContain('DEBUNK rules');
    const result = await stub.generateStructured({
      systemPrompt: system,
      userPrompt: debunkPrompt,
      schema: TextPostPlanSchema,
    });
    expect(result.data.sourceCitations.length).toBeGreaterThan(0);
    expect(result.data.body).not.toMatch(/vote (for|against)/i);
  });

  it('rejects prompts without an output-kind marker', async () => {
    await expect(
      stub.generateStructured({
        systemPrompt: system,
        userPrompt: 'no marker here',
        schema: TextPostPlanSchema,
      }),
    ).rejects.toThrow(/output kind/);
  });
});

describe('prompt builders', () => {
  it('embeds disclosure and guardrail context', () => {
    const system = buildSystemPrompt(persona);
    expect(system).toContain('openly AI/virtual');
    expect(system).toContain('Professor Steve');

    const user = prompt('SHORT_VIDEO');
    expect(user).toContain('Banned claims');
    expect(user).toContain('guaranteed marks improvement');
    expect(user).toContain('## Output kind: SHORT_VIDEO');
  });
});

describe('createLlmProvider', () => {
  it('selects stub by default and rejects unknown providers', () => {
    expect(createLlmProvider('stub').name).toBe('stub');
    expect(() => createLlmProvider('nope')).toThrow(/Unknown LLM provider/);
  });
});
