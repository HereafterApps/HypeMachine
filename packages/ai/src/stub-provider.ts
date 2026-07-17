import type { z } from 'zod';
import {
  type LearningInsightPlan,
  type ReplyPlan,
  type ShortVideoPlan,
  type TextPostPlan,
} from '@hype/core';
import { LlmGenerationError, type LlmProvider, type LlmResult } from './provider.js';
import { OUTPUT_KIND_MARKER } from './prompts.js';

/**
 * Deterministic, keyless provider for local dev, demos, and tests. It keys
 * off the output-kind marker the prompt builders embed in every user prompt,
 * and returns schema-valid Professor-Steve-flavored content. A counter
 * varies hooks so consecutive generations aren't identical (duplicate
 * detection in guardrails stays meaningful).
 */
export class StubLlmProvider implements LlmProvider {
  readonly name = 'stub';
  private counter = 0;

  async generateStructured<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<LlmResult<T>> {
    const match = input.userPrompt.match(new RegExp(`${OUTPUT_KIND_MARKER}\\s*(\\w+)`));
    const kind = match?.[1];
    this.counter += 1;

    const isDebunk = /^Type: DEBUNK$/m.test(input.userPrompt);

    let raw: unknown;
    switch (kind) {
      case 'SHORT_VIDEO':
        raw = this.shortVideo(isDebunk);
        break;
      case 'TEXT_POST':
      case 'THREAD':
        raw = isDebunk ? this.debunkPost(input.userPrompt) : this.textPost();
        break;
      case 'REPLY':
      case 'DM_REPLY':
      case 'WHATSAPP_MESSAGE':
        raw = this.reply();
        break;
      case 'LEARNING_INSIGHT':
        raw = this.learningInsight();
        break;
      default:
        throw new LlmGenerationError(
          `Stub provider cannot infer output kind from prompt (marker "${OUTPUT_KIND_MARKER}" missing).`,
          false,
        );
    }

    const parsed = input.schema.safeParse(raw);
    if (!parsed.success) {
      throw new LlmGenerationError(
        `Stub output failed schema validation: ${parsed.error.message}`,
        false,
      );
    }
    return {
      data: parsed.data,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
  }

  private debunkPost(userPrompt: string): TextPostPlan {
    const claim = userPrompt.match(/claim[^:]*:\s*"([^"]+)"/i)?.[1] ?? 'the claim in question';
    return {
      body:
        `Seen the claim that ${claim}? I checked the original source. The claim doesn't hold up: ` +
        `the primary record says otherwise. Judge the evidence yourself — link below.`,
      hook: `That viral claim? I read the original source.`,
      cta: '',
      hashtags: [],
      campaignPlugType: 'NONE',
      whyThisShouldWork: 'Calm, source-first correction; no side-taking.',
      riskNotes: [],
      sourceCitations: ['https://example.org/primary-source'],
    };
  }

  private shortVideo(isDebunk = false): ShortVideoPlan {
    const hooks = [
      `I'm 80 years old and I just found an app that teaches better than half the textbooks I grew up with.`,
      `Fifty years of teaching, and a phone app just made me jealous.`,
      `We used to call throwing chalk "interactive learning". This is better.`,
    ];
    const n = this.counter;
    return {
      title: `I'm 80 and this learning app made me jealous (take ${n})`,
      hook: hooks[n % hooks.length]!,
      script:
        `You know what we used to call "interactive learning"? A teacher throwing chalk at the board ` +
        `and hoping the child stayed awake.\n\nNow I'm looking at this thing called GuidedGenius, and it ` +
        `actually talks the student through the problem. It asks, explains, adjusts, and doesn't make ` +
        `the child feel stupid.\n\nAnd listen, I'm not even the target audience. I'm an old man with a ` +
        `suspicious relationship with technology.\n\nBut if I had this when I was teaching? Good grief. ` +
        `I would've saved thousands of hours.`,
      caption:
        'Professor Steve discovers GuidedGenius and gets mildly offended that students have better tools now.',
      hashtags: ['#learning', '#edtech', '#studytok'],
      cta: 'Try GuidedGenius if you want learning to feel less passive.',
      visualDirection:
        'Steve at webcam. Cut to app screen recording. Cut back to Steve squinting. Add captions. Add subtle zooms.',
      cameraStyle: 'WEBCAM_DESK',
      outfitSuggestion: 'brown cardigan over checked shirt',
      brollPlan: [
        {
          timestamp: '0:05-0:12',
          description: 'GuidedGenius app screen recording, student solving a problem',
          source: 'SCREEN_RECORDING',
        },
        {
          timestamp: '0:18-0:22',
          description: 'Close-up of app explaining a concept step by step',
          source: 'SCREEN_RECORDING',
        },
      ],
      thumbnailIdea: 'Steve squinting at a phone, caption "THIS teaches better than I did?!"',
      campaignPlugType: isDebunk ? 'NONE' : 'CASUAL',
      whyThisShouldWork:
        'Contrast of an 80-year-old professor praising new tech is inherently shareable; the plug is native to the story.',
      riskNotes: [],
      sourceCitations: isDebunk ? ['https://example.org/primary-source'] : [],
    };
  }

  private textPost(): TextPostPlan {
    // Kept under X's 280-char limit including hashtags — the guardrail
    // length check should only trip on genuinely oversized content.
    const bodies = [
      `Taught for 50 years. The best students asked questions. GuidedGenius asks the student questions instead of lecturing. Took us half a century to put that in an app.`,
      `Hot take from an old man: a dead PDF is not "digital learning". It's a paper worksheet with extra steps. Interactive means the material responds to the student.`,
      `A student's confusion is data, not failure. Tools that adapt to confusion beat tools that grade it.`,
    ];
    const n = this.counter;
    return {
      body: bodies[n % bodies.length]!,
      hook: `Taught for 50 years — here's what actually made students learn.`,
      cta: n % 2 === 0 ? 'Learning should talk back. guidedgenius.com' : '',
      hashtags: ['#education', '#learning'],
      campaignPlugType: n % 3 === 1 ? 'NONE' : 'CASUAL',
      whyThisShouldWork:
        'Credibility of a veteran teacher plus a mildly contrarian framing drives replies.',
      riskNotes: [],
      sourceCitations: [],
    };
  }

  private reply(): ReplyPlan {
    return {
      reply:
        `Ha! Fair question. No, I don't get paid every time I say it — I just genuinely think staring at ` +
        `a dead PDF is a waste of a young brain. Try it yourself and argue with me after.`,
      tone: 'warm, amused, direct',
      shouldMentionCampaign: false,
      campaignMention: '',
      riskLevel: 'LOW',
      escalateToHuman: false,
      reason: 'Benign audience banter on own post; no sensitive topic detected.',
    };
  }

  private learningInsight(): LearningInsightPlan {
    return {
      insight:
        'Videos where Steve reacts to the app UI on screen outperform pure talking-head videos.',
      evidence:
        'Screen-recording b-roll posts averaged higher engagement rate than talking-head-only posts in the compared sample.',
      confidence: 0.76,
      actionRecommendation:
        'Include at least one app screen-recording b-roll segment in future short videos.',
    };
  }
}
