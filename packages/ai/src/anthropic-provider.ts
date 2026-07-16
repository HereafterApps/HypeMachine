import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { LlmGenerationError, type LlmProvider, type LlmResult } from './provider.js';

// $ per million tokens; used for approximate cost tracking (§25).
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  maxRetries?: number;
}

/**
 * First-party LLM implementation (product-plan §3.1): Anthropic Claude with
 * structured outputs. Model claude-opus-4-8 by default — adaptive thinking,
 * no sampling params (removed on Opus 4.7+; `temperature` hints are ignored).
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions = {}) {
    this.client = new Anthropic({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      maxRetries: options.maxRetries ?? 2,
    });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8';
  }

  async generateStructured<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<LlmResult<T>> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: input.maxTokens ?? 16000,
      thinking: { type: 'adaptive' },
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
      output_config: { format: zodOutputFormat(input.schema) },
    });

    if (response.stop_reason === 'refusal') {
      throw new LlmGenerationError('Model refused the generation request.', false);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new LlmGenerationError('Generation hit max_tokens before completing.', true);
    }
    if (response.parsed_output == null) {
      throw new LlmGenerationError('Model output did not match the expected schema.', true);
    }

    const pricing = PRICING[this.model] ?? { input: 5, output: 25 };
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    return {
      data: response.parsed_output,
      usage: {
        inputTokens,
        outputTokens,
        costUsd:
          (inputTokens / 1_000_000) * pricing.input +
          (outputTokens / 1_000_000) * pricing.output,
      },
    };
  }
}
