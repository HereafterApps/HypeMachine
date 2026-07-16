import { describe, expect, it } from 'vitest';
import { runGuardrails, textSimilarity, type GuardrailPolicy } from '../src/index.js';

const policy: GuardrailPolicy = {
  allowedTopics: ['education', 'edtech'],
  bannedTopics: ['medical claims'],
  allowedClaims: ['GuidedGenius helps make learning interactive.'],
  bannedClaims: ['guaranteed marks improvement', 'replaces all teachers'],
  requiredDisclosures: [],
  wordsToAvoid: ['literally insane'],
  allowCompetitorMentions: false,
  competitorNames: ['TutorBot'],
  directnessLevel: 'CASUAL',
};

function content(overrides: Partial<Parameters<typeof runGuardrails>[1]> = {}) {
  return {
    platform: 'X' as const,
    texts: [{ label: 'body', value: 'Learning should talk back. GuidedGenius does.' }],
    hashtags: ['#edtech'],
    campaignPlugType: 'CASUAL' as const,
    riskNotes: [],
    recentTexts: [],
    ...overrides,
  };
}

describe('runGuardrails', () => {
  it('passes clean content with an all-green checklist', () => {
    const result = runGuardrails(policy, content());
    expect(result.passed).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.riskLevel).toBe('LOW');
    expect(result.checklist.every((c) => c.passed)).toBe(true);
  });

  it('blocks banned claims', () => {
    const result = runGuardrails(
      policy,
      content({
        texts: [{ label: 'body', value: 'GuidedGenius gives GUARANTEED marks improvement!' }],
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.blockers[0]).toMatch(/banned claim/i);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.requiredEdits.length).toBeGreaterThan(0);
  });

  it('blocks competitor mentions when disallowed', () => {
    const result = runGuardrails(
      policy,
      content({ texts: [{ label: 'body', value: 'Way better than TutorBot.' }] }),
    );
    expect(result.passed).toBe(false);
    expect(result.blockers[0]).toMatch(/competitor/i);
  });

  it('blocks over-length X posts', () => {
    const result = runGuardrails(
      policy,
      content({ texts: [{ label: 'body', value: 'x'.repeat(300) }] }),
    );
    expect(result.passed).toBe(false);
    expect(result.blockers[0]).toMatch(/exceeds X limit/);
  });

  it('warns on plug more direct than campaign setting', () => {
    const result = runGuardrails(policy, content({ campaignPlugType: 'DIRECT' }));
    expect(result.passed).toBe(true);
    expect(result.warnings[0]).toMatch(/more direct/);
  });

  it('warns on near-duplicate content', () => {
    const body =
      'Taught for 50 years. The best students were never the ones who memorized fastest.';
    const result = runGuardrails(
      policy,
      content({
        texts: [{ label: 'body', value: body }],
        recentTexts: [`${body} They asked questions.`],
      }),
    );
    expect(result.warnings.some((w) => w.includes('duplicate'))).toBe(true);
  });
});

describe('textSimilarity', () => {
  it('is high for near-identical text and low for unrelated text', () => {
    const a = 'the quick brown fox jumps over the lazy dog every single day';
    expect(textSimilarity(a, a)).toBe(1);
    expect(textSimilarity(a, 'completely different words about learning apps and tea')).toBe(0);
  });
});
