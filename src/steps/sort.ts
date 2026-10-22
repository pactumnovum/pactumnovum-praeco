// Step 2: sort. One question per item, answered by Jev.
// Only items answered yes with p >= 0.90 continue to the fact-check.

import type { ItemRow } from "../items.ts";
import { BudgetExceededError, LlmUnavailableError } from "../llm/index.ts";
import { errorMessage, log } from "../log.ts";
import { QUESTIONS, THRESHOLD, type StepContext } from "./context.ts";

export interface SortSummary {
  sorted: number;
  relevant: number;
  irrelevant: number;
  failed: number;
  stoppedBy?: string;
}

const MAX_ATTEMPTS = 3;
const TEXT_FOR_JUDGE = 6_000;

export async function sortStep(ctx: StepContext): Promise<SortSummary> {
  const summary: SortSummary = { sorted: 0, relevant: 0, irrelevant: 0, failed: 0 };
  if (!ctx.llm) {
    summary.stoppedBy = "no model provider";
    return summary;
  }
  const items = await ctx.db.all<ItemRow>(
    "SELECT * FROM engine_items WHERE status = 'new' ORDER BY fetched_at ASC, id ASC LIMIT ?1",
    [ctx.config.limits.sortPerRun],
  );
  for (const item of items) {
    try {
      const j = await ctx.llm.judge({
        purpose: "sort",
        question: QUESTIONS.sort,
        content: { title: item.title, summary: item.summary, text: item.body.slice(0, TEXT_FOR_JUDGE) },
      });
      const yes = j.p >= THRESHOLD;
      const status = yes ? (item.kind === "topic" ? "topic" : "relevant") : "irrelevant";
      await ctx.db.run(
        "UPDATE engine_items SET status = ?1, sort_p = ?2, sort_model = ?3, sorted_at = ?4 WHERE id = ?5",
        [status, j.p, j.model, ctx.now.toISOString(), item.id],
      );
      summary.sorted++;
      if (yes) summary.relevant++;
      else summary.irrelevant++;
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
        attempts >= MAX_ATTEMPTS ? "failed" : "new",
        item.id,
      ]);
    }
  }
  log.info("sort done", { ...summary });
  return summary;
}
