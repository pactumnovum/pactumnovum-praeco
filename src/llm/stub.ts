// Offline model for dry runs and tests. Deterministic, free, and never touches the network.
// It still receives the system prompt, so tests can check that every call carries it.

import { systemPrompt } from "./prompt.ts";
import type { JudgeRequest, Judgement, LlmClient, Meter, ReviewRequest, ReviewResult } from "./types.ts";

const GAP_WORDS =
  /\b(richest|billionaires?|poorest|inequalit\w*|wealth gap|desigualdad\w*|más ricos|pobreza|inégalit\w*|plus riches|milliardaires?|ungleichheit\w*|reichsten|milliardär\w*|desigualdade\w*|mais ricos|bilionári\w*|gini)\b/iu;
const HEDGE_WORDS = /\b(could|might|may|projected|forecast\w*|podría|pourrait|könnte|poderia)\b/iu;

export interface StubCall {
  kind: "judge" | "review";
  purpose: string;
  system: string;
}

export function stubClient(meter?: Meter, calls: StubCall[] = []): LlmClient & { calls: StubCall[] } {
  async function record(purpose: string) {
    await meter?.record({ provider: "stub", model: "stub", purpose, inputTokens: 0, outputTokens: 0, costUsd: 0, ok: true });
  }
  return {
    provider: "stub",
    calls,

    async judge(req: JudgeRequest): Promise<Judgement> {
      calls.push({ kind: "judge", purpose: req.purpose, system: systemPrompt() });
      await record(req.purpose);
      const text = Object.values(req.content).join("\n");
      if (req.purpose === "sort") return { p: GAP_WORDS.test(text) ? 0.95 : 0.05, model: "stub" };
      // Answer bank: the stub never matches, so a dry run never replies.
      if (req.purpose.startsWith("answer")) return { p: 0.05, model: "stub" };
      // Claim support: confident unless the claim hedges, which sends it to the reviewer.
      const claim = req.content.claim ?? text;
      return { p: HEDGE_WORDS.test(claim) ? 0.6 : 0.95, model: "stub" };
    },

    async review(req: ReviewRequest): Promise<ReviewResult> {
      calls.push({ kind: "review", purpose: req.purpose, system: systemPrompt() });
      await record(req.purpose);
      const claim = req.content.claim ?? "";
      return { yes: !HEDGE_WORDS.test(claim), confidence: 0.95, model: "stub-reviewer" };
    },
  };
}
