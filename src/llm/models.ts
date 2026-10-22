// Model identifiers, checked against each provider's model list (October 2026).
// OpenRouter: GET https://openrouter.ai/api/v1/models. Jev: OpenRouter's Decisions API docs.
// Pinned versions only, never "latest" aliases.

export const OPENROUTER_MODELS = {
  judge: "typesafe/jev-1.14",
  writer: "anthropic/claude-haiku-5.5",
  reviewer: "anthropic/claude-sonnet-5.5",
} as const;

export const ANTHROPIC_MODELS = {
  // Jev is not available on Anthropic's API. Haiku gives a constrained yes/no instead,
  // and Sonnet confirms every "yes" at the same threshold.
  judge: "claude-haiku-5-5",
  writer: "claude-haiku-5-5",
  reviewer: "claude-sonnet-5-5",
} as const;

/** USD per million tokens, used when a provider does not report the cost itself. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "typesafe/jev-1.14": { input: 0.042, output: 0 },
  "anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5 },
  "anthropic/claude-sonnet-5.5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model];
  if (!price) throw new Error(`no price known for model ${model}`);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
