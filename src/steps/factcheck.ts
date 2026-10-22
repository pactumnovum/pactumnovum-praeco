// Step 3: fact-check.
//
// Code extracts each number and checks it appears verbatim in the source text.
// Jev judges whether the source supports the claim. If p < 0.90, Sonnet decides.
// Unsupported means dropped: the fact is stored as unsupported and never used.
// Numbers from open data APIs are structured values read by code, so they are
// supported by construction and need no model.

import { containsVerbatim, extractNumbers, type Lang, type NumberMention } from "../facts/numbers.ts";
import type { ItemRow } from "../items.ts";
import { MAX_BODY_CHARS } from "../items.ts";
import { BudgetExceededError, LlmUnavailableError } from "../llm/index.ts";
import { errorMessage, log } from "../log.ts";
import { bodyToRows } from "../sources/datasets.ts";
import { htmlToText, splitSentences } from "../text.ts";
import { QUESTIONS, THRESHOLD, type StepContext } from "./context.ts";

export interface CheckSummary {
  items: number;
  claims: number;
  supported: number;
  unsupported: number;
  reviewed: number;
  noSourceText: number;
  failed: number;
  stoppedBy?: string;
}

const MAX_ATTEMPTS = 3;
const MIN_BODY = 800;
const MIN_USABLE_BODY = 200;
const MAX_CLAIM_CHARS = 400;
const SOURCE_WINDOW = 1_500;

export interface Claim {
  sentence: string;
  mentions: NumberMention[];
  /** Character offset of the sentence in the source text. */
  at: number;
}

/** Sentences that hold at least one significant number, each number verified verbatim. */
export function selectClaims(body: string, lang: Lang, max: number): Claim[] {
  const claims: Claim[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  for (const sentence of splitSentences(body)) {
    const at = Math.max(0, body.indexOf(sentence.slice(0, 40), cursor));
    cursor = at;
    if (sentence.length > MAX_CLAIM_CHARS || seen.has(sentence)) continue;
    const mentions = extractNumbers(sentence, lang).filter(
      (m) => m.significant && containsVerbatim(body, m.core),
    );
    if (mentions.length === 0) continue;
    seen.add(sentence);
    claims.push({ sentence, mentions, at });
    if (claims.length >= max) break;
  }
  return claims;
}

function sourceWindow(body: string, at: number): string {
  const start = Math.max(0, at - SOURCE_WINDOW);
  return body.slice(start, at + SOURCE_WINDOW);
}

function sourceDate(item: ItemRow): string {
  return (item.published_at ?? item.fetched_at).slice(0, 10);
}

async function insertFact(
  ctx: StepContext,
  item: ItemRow,
  m: NumberMention | { text: string; core: string; value: number; unit: string },
  claim: string,
  status: "supported" | "unsupported",
  judge: { p: number | null; model: string },
  review?: { model: string; yes: boolean },
) {
  await ctx.db.run(
    "INSERT OR IGNORE INTO engine_facts (item_id, number_text, number_core, value, unit, claim, source_url, " +
      "source_name, source_date, lang, status, judge_p, judge_model, reviewer_model, reviewer_supported, created_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
    [
      item.id,
      m.text,
      m.core,
      m.value,
      m.unit,
      claim,
      item.url,
      item.source_name,
      sourceDate(item),
      item.lang,
      status,
      judge.p,
      judge.model,
      review?.model ?? null,
      review ? (review.yes ? 1 : 0) : null,
      ctx.now.toISOString(),
    ],
  );
}

async function checkDataset(ctx: StepContext, item: ItemRow, summary: CheckSummary): Promise<number> {
  let supported = 0;
  const unit = ctx.sources.datasets.find((d) => d.id === item.source_id)?.unit ?? "count";
  for (const row of bodyToRows(item.body)) {
    const claim = `${row.label}, ${row.area} (${row.period}): ${row.value}`;
    if (!containsVerbatim(item.body, row.value)) continue;
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    summary.claims++;
    await insertFact(ctx, item, { text: row.value, core: row.value, value, unit }, claim, "supported", {
      p: null,
      model: "code:structured-data",
    });
    supported++;
  }
  return supported;
}

/** Article text: the feed's own text, or the public page when the feed only has a teaser. */
async function sourceText(ctx: StepContext, item: ItemRow): Promise<string> {
  if (item.body.length >= MIN_BODY) return item.body;
  try {
    const page = await ctx.fetcher.get(item.url, { accept: "text/html" });
    if (page.status >= 200 && page.status < 300 && /html/i.test(page.contentType)) {
      const text = htmlToText(page.text).slice(0, MAX_BODY_CHARS);
      if (text.length > item.body.length) {
        await ctx.db.run("UPDATE engine_items SET body = ?1 WHERE id = ?2", [text, item.id]);
        return text;
      }
    }
  } catch (err) {
    log.warn("article fetch failed", { item: item.id, error: errorMessage(err) });
  }
  return item.body;
}

async function checkArticle(ctx: StepContext, item: ItemRow, summary: CheckSummary): Promise<number | null> {
  const body = await sourceText(ctx, item);
  if (body.length < MIN_USABLE_BODY || item.lang === "und") return null;
  const done = new Set(
    (await ctx.db.all<{ claim: string }>("SELECT DISTINCT claim FROM engine_facts WHERE item_id = ?1", [item.id])).map(
      (r) => r.claim,
    ),
  );
  let supported = (
    await ctx.db.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM engine_facts WHERE item_id = ?1 AND status = 'supported'",
      [item.id],
    )
  )[0]?.n ?? 0;

  for (const claim of selectClaims(body, item.lang, ctx.config.limits.claimsPerItem)) {
    if (done.has(claim.sentence)) continue;
    summary.claims++;
    const content = { source: sourceWindow(body, claim.at), claim: claim.sentence };
    const judge = await ctx.llm!.judge({ purpose: "claim_support", question: QUESTIONS.support, content });
    let ok = judge.p >= THRESHOLD;
    let review: { model: string; yes: boolean } | undefined;
    if (!ok) {
      const r = await ctx.llm!.review({ purpose: "claim_review", question: QUESTIONS.support, content });
      summary.reviewed++;
      ok = r.yes && r.confidence >= THRESHOLD;
      review = { model: r.model, yes: ok };
    }
    for (const m of claim.mentions) {
      await insertFact(ctx, item, m, claim.sentence, ok ? "supported" : "unsupported", judge, review);
    }
    if (ok) {
      supported++;
      summary.supported++;
    } else summary.unsupported++;
  }
  return supported;
}

export async function factCheckStep(ctx: StepContext): Promise<CheckSummary> {
  const summary: CheckSummary = {
    items: 0, claims: 0, supported: 0, unsupported: 0, reviewed: 0, noSourceText: 0, failed: 0,
  };
  const items = await ctx.db.all<ItemRow>(
    "SELECT * FROM engine_items WHERE status = 'relevant' ORDER BY sorted_at ASC, id ASC LIMIT ?1",
    [ctx.config.limits.checkPerRun],
  );
  for (const item of items) {
    if (item.kind !== "dataset" && !ctx.llm) {
      summary.stoppedBy = "no model provider";
      break;
    }
    try {
      let supported: number | null;
      if (item.kind === "dataset") {
        supported = await checkDataset(ctx, item, summary);
        summary.supported += supported;
      } else {
        supported = await checkArticle(ctx, item, summary);
      }
      const status = supported === null ? "no_source_text" : supported > 0 ? "checked" : "no_facts";
      if (supported === null) summary.noSourceText++;
      await ctx.db.run("UPDATE engine_items SET status = ?1, checked_at = ?2 WHERE id = ?3", [
        status,
        ctx.now.toISOString(),
        item.id,
      ]);
      summary.items++;
    } catch (err) {
      if (err instanceof BudgetExceededError || err instanceof LlmUnavailableError) {
        summary.stoppedBy = errorMessage(err);
        break;
      }
      summary.failed++;
      const attempts = item.attempts + 1;
      await ctx.db.run("UPDATE engine_items SET attempts = ?1, last_error = ?2, status = ?3 WHERE id = ?4", [
        attempts,
        errorMessage(err),
        attempts >= MAX_ATTEMPTS ? "failed" : "relevant",
        item.id,
      ]);
    }
  }
  log.info("fact-check done", { ...summary });
  return summary;
}
