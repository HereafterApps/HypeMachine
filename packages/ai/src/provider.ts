import type { z } from 'zod';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LlmResult<T> {
  data: T;
  usage: LlmUsage;
}

/**
 * Provider abstraction from product-plan §16.1, extended with token/cost
 * usage so the cost-tracking requirements of §25 can be met without
 * hardcoding a vendor.
 */
export interface LlmProvider {
  readonly name: string;
  generateStructured<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    /** Hint only — providers without sampling controls ignore it. */
    temperature?: number;
    maxTokens?: number;
  }): Promise<LlmResult<T>>;
}

export class LlmGenerationError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmGenerationError';
  }
}
