import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { GenerateStructuredInput, LlmProvider } from "./provider.js";

const DEFAULT_MODEL = "claude-opus-4-8";

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
}

/**
 * Anthropic implementation of LlmProvider using structured outputs
 * (output_config.format + Zod), so generation results are schema-validated
 * by the API rather than parsed by hand.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(options: AnthropicProviderOptions = {}) {
    this.client = new Anthropic(
      options.apiKey ? { apiKey: options.apiKey } : {},
    );
    this.model = options.model ?? DEFAULT_MODEL;
  }

  async generateStructured<T>(input: GenerateStructuredInput<T>): Promise<T> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: input.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      system: input.systemPrompt,
      messages: [{ role: "user", content: input.userPrompt }],
      output_config: {
        format: zodOutputFormat(input.schema),
      },
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        "LLM declined to generate this content (safety refusal). Adjust the campaign brief or guardrails and retry.",
      );
    }
    if (response.parsed_output == null) {
      throw new Error(
        `LLM output did not match the expected schema (stop_reason: ${response.stop_reason}).`,
      );
    }
    return response.parsed_output as T;
  }
}
