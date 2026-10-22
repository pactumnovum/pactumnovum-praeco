import type { Config } from "../config.ts";
import type { Db } from "../db/index.ts";
import { anthropicClient } from "./anthropic.ts";
import { dbMeter } from "./meter.ts";
import { openRouterClient } from "./openrouter.ts";
import { stubClient } from "./stub.ts";
import { LlmUnavailableError, type LlmClient } from "./types.ts";

export * from "./types.ts";

/**
 * The single entry point for model calls. Returns a client, or throws
 * LlmUnavailableError with a reason when no provider can be used.
 */
export function createLlm(config: Config, db: Db): LlmClient {
  if (config.llmProvider === "stub") return stubClient(dbMeter(db, Number.POSITIVE_INFINITY));
  if (config.monthlyAiBudgetUsd <= 0) throw new LlmUnavailableError("MONTHLY_AI_BUDGET_USD is not set");
  const meter = dbMeter(db, config.monthlyAiBudgetUsd);
  if (config.llmProvider === "openrouter") {
    if (!config.openrouterApiKey) throw new LlmUnavailableError("OPENROUTER_API_KEY is not set");
    return openRouterClient(config.openrouterApiKey, meter);
  }
  if (!config.anthropicApiKey) throw new LlmUnavailableError("ANTHROPIC_API_KEY is not set");
  return anthropicClient(config.anthropicApiKey, meter);
}
