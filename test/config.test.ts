import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  it("enables publishing only for the exact string true", () => {
    expect(loadConfig({ PUBLISHING_ENABLED: "true" }).publishingEnabled).toBe(true);
    for (const v of ["TRUE", "True", "1", "yes", " true", "", undefined]) {
      expect(loadConfig({ PUBLISHING_ENABLED: v }).publishingEnabled).toBe(false);
    }
  });

  it("never uses a paid model or D1 in a dry run", () => {
    const c = loadConfig({
      DRY_RUN: "1",
      LLM_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "test-key-not-real",
      CLOUDFLARE_ACCOUNT_ID: "a",
      D1_DATABASE_ID: "b",
      CLOUDFLARE_API_TOKEN: "c",
    });
    expect(c.llmProvider).toBe("stub");
    expect(c.d1).toBeUndefined();
  });

  it("defaults to no model budget", () => {
    expect(loadConfig({}).monthlyAiBudgetUsd).toBe(0);
    expect(loadConfig({ MONTHLY_AI_BUDGET_USD: "-5" }).monthlyAiBudgetUsd).toBe(0);
    expect(loadConfig({ MONTHLY_AI_BUDGET_USD: "25" }).monthlyAiBudgetUsd).toBe(25);
  });

  it("rejects an unknown provider", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "other" })).toThrow(/LLM_PROVIDER/);
  });
});
