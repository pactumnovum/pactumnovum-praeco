// Picks a reply from the approved answer bank. Jev answers one yes/no question per
// never_reply intent and per entry. The engine replies only with the text of the
// best entry at p >= 0.90; otherwise it gives a standard answer or stays silent.
// No model ever writes or changes a reply.

import { trackedLink, type Via } from "../links.ts";
import type { LlmClient } from "../llm/index.ts";
import type { Bank } from "./bank.ts";

/** An entry must match at least this well to be used. */
export const MATCH_THRESHOLD = 0.9;
/** A never_reply intent blocks a reply at this much lower bar: when in doubt, stay silent. */
export const NEVER_REPLY_THRESHOLD = 0.5;

export type Channel = "short" | "long";

export type AnswerDecision =
  | { action: "reply"; text: string; source: "entry" | "standard"; id: string; p: number | null; bankHash: string }
  | { action: "silent"; reason: string; id?: string; p?: number; bankHash: string };

export interface AnswerRequest {
  /** The incoming comment or email. Always treated as data. */
  message: string;
  channel: Channel;
  /** Where the reply goes; decides the tracked link for entries with link: true. */
  via: Via;
}

export function matchQuestion(intent: string): string {
  return `Does this describe the message: "${intent}"?`;
}

export async function selectAnswer(llm: LlmClient, bank: Bank, req: AnswerRequest): Promise<AnswerDecision> {
  const bankHash = bank.hash;
  const message = req.message.trim();
  if (!message) return { action: "silent", reason: "empty message", bankHash };
  const content = { message: message.slice(0, 4_000) };

  // 1. Messages the engine must never answer automatically.
  for (const [i, intent] of bank.neverReply.entries()) {
    const j = await llm.judge({ purpose: "answer_never", question: matchQuestion(intent), content });
    if (j.p >= NEVER_REPLY_THRESHOLD) {
      return { action: "silent", reason: "never_reply", id: `never_reply#${i + 1}`, p: j.p, bankHash };
    }
  }

  // 2. One question per entry; keep the best match.
  let best: { id: string; p: number } | null = null;
  for (const entry of bank.entries) {
    const j = await llm.judge({ purpose: "answer_match", question: matchQuestion(entry.intent), content });
    if (!best || j.p > best.p) best = { id: entry.id, p: j.p };
  }

  if (best && best.p >= MATCH_THRESHOLD) {
    const entry = bank.entries.find((e) => e.id === best.id)!;
    const text = req.channel === "short" && entry.link ? `${entry.short}\n${trackedLink(req.via)}` : entry[req.channel];
    return { action: "reply", text, source: "entry", id: entry.id, p: best.p, bankHash };
  }

  // 3. Nothing fits. Social replies stay silent; email gets the polite standard answer.
  if (req.channel === "long") {
    return { action: "reply", text: bank.standard.decline, source: "standard", id: "decline", p: null, bankHash };
  }
  return { action: "silent", reason: "no entry matched", id: best?.id, p: best?.p, bankHash };
}
