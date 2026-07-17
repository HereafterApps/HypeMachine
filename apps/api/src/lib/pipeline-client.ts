import type { CampaignPlugType, GuardrailResult } from '@hype/core';
import type { GuardrailPolicy } from '../services/guardrail-policy.js';

/**
 * HTTP client for the Python pipeline service (apps/pipeline) — the single
 * source of truth for generation, guardrail checks, and learning insights
 * (build-spec §4.1 hybrid stack). The TS side keeps orchestration only.
 */

export interface PipelinePersonaContext {
  name: string;
  backstory: string;
  worldview: string;
  speakingStyle: string;
  tone: string;
  humorStyle: string;
  disclosureText: string;
  memoryHighlights: { type: string; content: string }[];
}

export interface PipelineCampaignContext {
  name: string;
  campaignType: string;
  objective: string;
  subject?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  productUrl?: string | null;
  targetAudience?: string | null;
  directnessLevel: string;
  plugFrequency: string;
  plugPercentage?: number | null;
  mainMessage?: string | null;
  productLine?: string | null;
  sources: { type: string; title: string; content: string }[];
  learnings: string[];
}

export interface PipelineGenerateRequest {
  outputKind: string;
  platform: string;
  contentType: string;
  persona: PipelinePersonaContext;
  campaign: PipelineCampaignContext;
  policy: GuardrailPolicy;
  includePlug?: boolean | null;
  extraInstructions?: string | null;
  recentSummaries: string[];
  recentTexts: string[];
}

export interface PipelineUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface PipelineGenerateResponse {
  fields: {
    title?: string | null;
    hook?: string | null;
    script?: string | null;
    caption?: string | null;
    bodyText?: string | null;
    hashtags: string[];
    cta?: string | null;
  };
  plugType: CampaignPlugType;
  riskNotes: string[];
  sourceCitations: string[];
  metadata: Record<string, unknown>;
  usage: PipelineUsage;
  guardrails: GuardrailResult;
  generationPrompt: string;
}

export interface PipelineEvaluateRequest {
  policy: GuardrailPolicy;
  platform: string;
  title?: string | null;
  hook?: string | null;
  script?: string | null;
  caption?: string | null;
  bodyText?: string | null;
  cta?: string | null;
  hashtags: string[];
  campaignPlugType?: CampaignPlugType;
  riskNotes?: string[];
  sourceCitations?: string[];
  recentTexts?: string[];
}

export interface PipelineInsightsRequest {
  persona: PipelinePersonaContext;
  campaignName: string;
  objective: string;
  optimizationTarget: string;
  performanceLines: string[];
}

export interface PipelineInsightsResponse {
  insight: {
    insight: string;
    evidence: string;
    confidence: number;
    actionRecommendation: string;
  };
  usage: PipelineUsage;
}

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

export class PipelineClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new PipelineError(
        `Pipeline service unreachable at ${this.baseUrl} — start it with \`pnpm dev:pipeline\`. (${error instanceof Error ? error.message : error})`,
        0,
      );
    }
    if (!response.ok) {
      throw new PipelineError(
        `Pipeline ${path} failed (${response.status}): ${await response.text()}`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  generate(request: PipelineGenerateRequest): Promise<PipelineGenerateResponse> {
    return this.post('/generate', request);
  }

  evaluate(request: PipelineEvaluateRequest): Promise<GuardrailResult> {
    return this.post('/evaluate', request);
  }

  insights(request: PipelineInsightsRequest): Promise<PipelineInsightsResponse> {
    return this.post('/insights', request);
  }

  async health(): Promise<{ ok: boolean; provider: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) throw new PipelineError(`Pipeline health check failed`, response.status);
    return (await response.json()) as { ok: boolean; provider: string };
  }
}
