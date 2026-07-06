import type { z } from "zod";

export interface GenerateStructuredInput<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}

/** Vendor-neutral LLM interface (plan §16.1). */
export interface LlmProvider {
  readonly name: string;
  generateStructured<T>(input: GenerateStructuredInput<T>): Promise<T>;
}
