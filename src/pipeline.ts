// One hourly run: fetch, sort, fact-check. Every step reads from and writes to the
// database, so a failed or interrupted run simply continues next hour.

import type { Config } from "./config.ts";
import { migrate } from "./db/migrate.ts";
import type { Db } from "./db/index.ts";
import { createLlm, LlmUnavailableError, type LlmClient } from "./llm/index.ts";
import { errorMessage, log } from "./log.ts";
import type { Fetcher } from "./net.ts";
import type { SourcesConfig } from "./sources/config.ts";
import type { StepContext } from "./steps/context.ts";
import { factCheckStep, type CheckSummary } from "./steps/factcheck.ts";
import { fetchStep, type FetchSummary } from "./steps/fetch.ts";
import { sortStep, type SortSummary } from "./steps/sort.ts";

export interface RunSummary {
  mode: "dry_run" | "live";
  publishing: boolean;
  llm: string;
  fetch?: FetchSummary;
  sort?: SortSummary;
  check?: CheckSummary;
}

export interface RunDeps {
  db: Db;
  fetcher: Fetcher;
  sources: SourcesConfig;
  /** Tests inject a model client. Otherwise one is built from the configuration. */
  llm?: LlmClient;
  now?: Date;
}

export async function runEngine(config: Config, deps: RunDeps): Promise<RunSummary> {
  const now = deps.now ?? new Date();
  const { db } = deps;
  await migrate(db);

  let llm = deps.llm;
  let llmState = llm ? llm.provider : "";
  if (!llm) {
    try {
      llm = createLlm(config, db);
      llmState = llm.provider;
    } catch (err) {
      if (!(err instanceof LlmUnavailableError)) throw err;
      llmState = `unavailable (${errorMessage(err)})`;
      log.warn("model calls unavailable; sort and fact-check will wait", { reason: errorMessage(err) });
    }
  }

  const summary: RunSummary = {
    // Milestone 1 never publishes. The mode records what a later publish step would do.
    mode: config.publishingEnabled && !config.dryRun ? "live" : "dry_run",
    publishing: config.publishingEnabled && !config.dryRun,
    llm: llmState,
  };

  const run = await db.run("INSERT INTO engine_runs (started_at, mode, status) VALUES (?1, ?2, 'running')", [
    now.toISOString(),
    summary.mode,
  ]);
  const runId = run.lastRowId;
  const ctx: StepContext = { config, db, fetcher: deps.fetcher, sources: deps.sources, llm, now };

  try {
    summary.fetch = await fetchStep(ctx);
    summary.sort = await sortStep(ctx);
    summary.check = await factCheckStep(ctx);
    await db.run("UPDATE engine_runs SET finished_at = ?1, status = 'ok', summary = ?2 WHERE id = ?3", [
      new Date().toISOString(),
      JSON.stringify(summary),
      runId,
    ]);
    log.info("run done", { ...summary });
    return summary;
  } catch (err) {
    await db.run("UPDATE engine_runs SET finished_at = ?1, status = 'error', summary = ?2 WHERE id = ?3", [
      new Date().toISOString(),
      JSON.stringify({ ...summary, error: errorMessage(err) }),
      runId,
    ]);
    throw err;
  }
}
