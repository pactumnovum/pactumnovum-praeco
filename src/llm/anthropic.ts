import Anthropic from "@anthropic-ai/sdk";
import { asData, systemPrompt } from "./prompt.ts";
import { ANTHROPIC_MODELS, estimateCost } from "./models.ts";
import {
  YES_NO_SCHEMA,
  parseYesNo,
  reviewPrompt,
  type JudgeRequest,
  type Judgement,
  type LlmClient,
  type Meter,
  type ReviewRequest,
  type ReviewResult,
} from "./types.ts";

export const JUDGE_THRESHOLD = 0.9;

/**
 * Fallback provider: Anthropic's API on the project's own account.
 * Jev is not available here, so judge() asks Haiku for a constrained yes/no and,
 * when Haiku says yes at or above the threshold, Sonnet must confirm at the same
 * threshold. The lower of the two probabilities is returned.
 */
export function anthropicClient(apiKey: string, meter: Meter, client?: Anthropic): LlmClient {
  const api = client ?? new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });

  async function ask(model: string, purpose: string, question: string, content: Record<string, string>) {
    await meter.check();
    let ok = false;
    let input = 0;
    let output = 0;
    try {
      const res = await api.messages.create({
        model,
        max_tokens: 4000,
        system: systemPrompt(),
        messages: [{ role: "user", content: reviewPrompt(question, asData(content)) }],
        output_config: { effort: "low", format: { type: "json_schema", schema: YES_NO_SCHEMA } },
      });
      input = res.usage.input_tokens;
      output = res.usage.output_tokens;
      ok = true;
      // A refusal or a truncated answer counts as "no". When in doubt, do not publish.
      if (res.stop_reason !== "end_turn") return { yes: false, confidence: 1 };
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return parseYesNo(text);
    } finally {
      await meter.record({
        provider: "anthropic",
        model,
        purpose,
        inputTokens: input,
        outputTokens: output,
        costUsd: estimateCost(model, input, output),
        ok,
      });
    }
  }

  const toP = (v: { yes: boolean; confidence: number }) => (v.yes ? v.confidence : 1 - v.confidence);

  return {
    provider: "anthropic",

    async judge(req: JudgeRequest): Promise<Judgement> {
      const first = toP(await ask(ANTHROPIC_MODELS.judge, req.purpose, req.question, req.content));
      if (first < JUDGE_THRESHOLD) return { p: first, model: ANTHROPIC_MODELS.judge };
      const second = toP(await ask(ANTHROPIC_MODELS.reviewer, `${req.purpose}:confirm`, req.question, req.content));
      return { p: Math.min(first, second), model: `${ANTHROPIC_MODELS.judge}+${ANTHROPIC_MODELS.reviewer}` };
    },

    async review(req: ReviewRequest): Promise<ReviewResult> {
      const v = await ask(ANTHROPIC_MODELS.reviewer, req.purpose, req.question, req.content);
      return { ...v, model: ANTHROPIC_MODELS.reviewer };
    },
  };
}
