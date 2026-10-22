import type { LlmProviderName } from "../config.ts";

/** One yes/no question. Jev degrades when a question holds several judgements, so ask one. */
export interface JudgeRequest {
  purpose: string;
  question: string;
  content: Record<string, string>;
}

export interface Judgement {
  /** Probability that the answer is yes, 0..1. */
  p: number;
  model: string;
}

/** A yes/no review by the stronger model (Sonnet), with its confidence. */
export interface ReviewRequest {
  purpose: string;
  question: string;
  content: Record<string, string>;
}

export interface ReviewResult {
  yes: boolean;
  confidence: number;
  model: string;
}

export interface Usage {
  provider: LlmProviderName;
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
}

/** Every client reports usage here and asks it before each call. */
export interface Meter {
  /** Throws BudgetExceededError when the month's spend has reached the limit. */
  check(): Promise<void>;
  record(usage: Usage): Promise<void>;
}

export interface LlmClient {
  readonly provider: LlmProviderName;
  judge(req: JudgeRequest): Promise<Judgement>;
  review(req: ReviewRequest): Promise<ReviewResult>;
}

export class LlmUnavailableError extends Error {
  constructor(reason: string) {
    super(`model calls unavailable: ${reason}`);
    this.name = "LlmUnavailableError";
  }
}

export class BudgetExceededError extends Error {
  constructor(spent: number, limit: number) {
    super(`monthly AI budget reached: spent ${spent.toFixed(4)} of ${limit.toFixed(2)} USD`);
    this.name = "BudgetExceededError";
  }
}

export const YES_NO_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", enum: ["yes", "no"] },
    confidence: { type: "number" },
  },
  required: ["answer", "confidence"],
  additionalProperties: false,
} as const;

export function clamp01(n: unknown): number {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, x));
}

/** Parses {"answer": "yes"|"no", "confidence": n}. Anything else counts as "no". */
export function parseYesNo(text: string): { yes: boolean; confidence: number } {
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    const obj = JSON.parse(cleaned) as { answer?: unknown; confidence?: unknown };
    if (obj.answer !== "yes" && obj.answer !== "no") return { yes: false, confidence: 1 };
    return { yes: obj.answer === "yes", confidence: clamp01(obj.confidence) };
  } catch {
    return { yes: false, confidence: 1 };
  }
}

export function reviewPrompt(question: string, data: string): string {
  return [
    "Answer one question with yes or no, and give your confidence from 0 to 1.",
    "If you are unsure, answer no.",
    `Question: ${question}`,
    "",
    data,
  ].join("\n");
}
