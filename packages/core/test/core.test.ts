import { describe, expect, it } from 'vitest';
import {
  ShortVideoPlanSchema,
  TextPostPlanSchema,
  engagementRate,
  riskLevelFromScore,
  slugify,
} from '../src/index.js';

describe('slugify', () => {
  it('produces url-safe slugs', () => {
    expect(slugify('Professor Steve')).toBe('professor-steve');
    expect(slugify('  GuidedGenius!! Campaign #1 ')).toBe('guidedgenius-campaign-1');
    expect(slugify('Café Créme')).toBe('cafe-creme');
  });
});

describe('engagementRate', () => {
  it('computes interactions / views as percentage', () => {
    expect(
      engagementRate({ views: 1000, likes: 50, comments: 10, shares: 4, saves: 0 }),
    ).toBe(6.4);
  });
  it('handles zero views', () => {
    expect(
      engagementRate({ views: 0, likes: 5, comments: 0, shares: 0, saves: 0 }),
    ).toBe(0);
  });
});

describe('riskLevelFromScore', () => {
  it('maps score bands', () => {
    expect(riskLevelFromScore(0)).toBe('LOW');
    expect(riskLevelFromScore(30)).toBe('MEDIUM');
    expect(riskLevelFromScore(75)).toBe('HIGH');
  });
});

describe('content schemas', () => {
  it('accepts a valid short-video plan', () => {
    const plan = {
      title: 'I am 80 and this learning app made me jealous',
      hook: 'I just found an app that teaches better than my old textbooks.',
      script: 'You know what we used to call interactive learning?…',
      caption: 'Professor Steve discovers GuidedGenius.',
      hashtags: ['#learning', '#edtech'],
      cta: 'Try GuidedGenius.',
      visualDirection: 'Steve at webcam, cut to app screen recording.',
      cameraStyle: 'WEBCAM_DESK',
      outfitSuggestion: 'brown cardigan',
      brollPlan: [
        { timestamp: '0:03-0:06', description: 'app UI closeup', source: 'SCREEN_RECORDING' },
      ],
      thumbnailIdea: 'Steve squinting at phone',
      campaignPlugType: 'CASUAL',
      whyThisShouldWork: 'Contrast of old professor + new tech.',
      riskNotes: [],
      sourceCitations: [],
    };
    expect(ShortVideoPlanSchema.parse(plan)).toMatchObject({ title: plan.title });
  });

  it('rejects a b-roll timestamp in the wrong format', () => {
    const result = ShortVideoPlanSchema.safeParse({
      title: 't', hook: 'h', script: 's', caption: 'c', hashtags: [], cta: '',
      visualDirection: '', cameraStyle: '', outfitSuggestion: '',
      brollPlan: [{ timestamp: '3s-6s', description: 'x', source: 'STOCK' }],
      thumbnailIdea: '', campaignPlugType: 'NONE', whyThisShouldWork: '', riskNotes: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown plug types on text posts', () => {
    const result = TextPostPlanSchema.safeParse({
      body: 'b', hook: 'h', cta: '', hashtags: [],
      campaignPlugType: 'SNEAKY', whyThisShouldWork: '', riskNotes: [],
    });
    expect(result.success).toBe(false);
  });
});
