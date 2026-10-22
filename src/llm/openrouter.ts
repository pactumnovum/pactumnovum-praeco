import { asData, systemPrompt } from "./prompt.ts";
import { OPENROUTER_MODELS, estimateCost } from "./models.ts";
import {
  YES_NO_SCHEMA,
  clamp01,
  parseYesNo,
  reviewPrompt,
  type JudgeRequest,
  type Judgement,
  type LlmClient,
  type Meter,
  type ReviewRequest,
  type ReviewResult,
} from "./types.ts";

const BASE = "https://openrouter.ai/api";

interface DecisionsResponse {
  model?: string;
  answers?: Record<string, { type?: string; noul?: number }>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
}

interface ChatResponse {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

/**
 * OpenRouter: Jev through the Decisions API for yes/no judgements,
 * Claude Sonnet 5.5 through chat completions for reviews.
 * Errors carry the HTTP status only, never the response body.
 */
export function openRouterClient(apiKey: string, meter: Meter, fetchImpl: typeof fetch = fetch): LlmClient {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetchImpl(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pactumnovum.org",
        "X-Title": "praeco",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`OpenRouter ${path} failed with HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    provider: "openrouter",

    async judge(req: JudgeRequest): Promise<Judgement> {
      await meter.check();
      const model = OPENROUTER_MODELS.judge;
      let ok = false;
      let usage: DecisionsResponse["usage"];
      try {
        const res = await post<DecisionsResponse>("/alpha/decisions", {
          model,
          // Jev has no system field. The rules travel in the state, labelled as rules,
          // and the content is wrapped as data.
          state: { rules: systemPrompt(), content: asData(req.content) },
          questions: { answer: { type: "noul", instructions: req.question } },
        });
        usage = res.usage;
        const noul = res.answers?.answer?.noul;
        if (typeof noul !== "number") throw new Error("Jev returned no noul answer");
        ok = true;
        return { p: clamp01(noul), model: res.model ?? model };
      } finally {
        const input = usage?.input_tokens ?? 0;
        const output = usage?.output_tokens ?? 0;
        await meter.record({
          provider: "openrouter",
          model,
          purpose: req.purpose,
          inputTokens: input,
          outputTokens: output,
          costUsd: usage?.cost ?? estimateCost(model, input, output),
          ok,
        });
      }
    },

    async review(req: ReviewRequest): Promise<ReviewResult> {
      await meter.check();
      const model = OPENROUTER_MODELS.reviewer;
      let ok = false;
      let usage: ChatResponse["usage"];
      try {
        const res = await post<ChatResponse>("/v1/chat/completions", {
          model,
          max_tokens: 4000,
          reasoning: { effort: "low" },
          messages: [
            { role: "system", content: systemPrompt() },
            { role: "user", content: reviewPrompt(req.question, asData(req.content)) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "yes_no", strict: true, schema: YES_NO_SCHEMA },
          },
          usage: { include: true },
        });
        usage = res.usage;
        const verdict = parseYesNo(res.choices?.[0]?.message?.content ?? "");
        ok = true;
        return { ...verdict, model: res.model ?? model };
      } finally {
        const input = usage?.prompt_tokens ?? 0;
        const output = usage?.completion_tokens ?? 0;
        await meter.record({
          provider: "openrouter",
          model,
          purpose: req.purpose,
          inputTokens: input,
          outputTokens: output,
          costUsd: usage?.cost ?? estimateCost(model, input, output),
          ok,
        });
      }
    },
  };
}
