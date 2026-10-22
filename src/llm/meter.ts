import type { Db } from "../db/index.ts";
import { BudgetExceededError, type Meter, type Usage } from "./types.ts";

export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function spentThisMonth(db: Db, now: Date = new Date()): Promise<number> {
  const rows = await db.all<{ total: number | null }>(
    "SELECT SUM(cost_usd) AS total FROM engine_llm_calls WHERE month = ?1",
    [currentMonth(now)],
  );
  return rows[0]?.total ?? 0;
}

/**
 * Records every model call in engine_llm_calls (counts and cost only, no text)
 * and refuses new calls once the month's spend reaches MONTHLY_AI_BUDGET_USD.
 * A limit of 0 refuses every paid call.
 */
export function dbMeter(db: Db, monthlyLimitUsd: number, now: () => Date = () => new Date()): Meter {
  return {
    async check() {
      const spent = await spentThisMonth(db, now());
      if (spent >= monthlyLimitUsd) throw new BudgetExceededError(spent, monthlyLimitUsd);
    },
    async record(u: Usage) {
      const at = now();
      await db.run(
        "INSERT INTO engine_llm_calls (at, month, provider, model, purpose, input_tokens, output_tokens, cost_usd, ok) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        [at.toISOString(), currentMonth(at), u.provider, u.model, u.purpose, u.inputTokens, u.outputTokens, u.costUsd, u.ok ? 1 : 0],
      );
    },
  };
}
