export * from './provider.js';
export * from './prompts.js';
export * from './stub-provider.js';
export * from './anthropic-provider.js';

import type { LlmProvider } from './provider.js';
import { AnthropicLlmProvider } from './anthropic-provider.js';
import { StubLlmProvider } from './stub-provider.js';

/** Selects the LLM provider from env (LLM_PROVIDER=anthropic|stub). */
export function createLlmProvider(kind?: string): LlmProvider {
  const selected = kind ?? process.env.LLM_PROVIDER ?? 'stub';
  switch (selected) {
    case 'anthropic':
      return new AnthropicLlmProvider();
    case 'stub':
      return new StubLlmProvider();
    default:
      throw new Error(`Unknown LLM provider: ${selected}`);
  }
}
