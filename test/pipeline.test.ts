import { describe, expect, it } from "vitest";
import type { Db } from "../src/db/index.ts";
import { verifyPostNumbers, type FactRef } from "../src/facts/numbers.ts";
import { BudgetExceededError, type LlmClient } from "../src/llm/index.ts";
import { stubClient } from "../src/llm/stub.ts";
import { systemPrompt } from "../src/llm/prompt.ts";
import { runEngine } from "../src/pipeline.ts";
import { NOW, fixtures, testConfig, testDb } from "./helpers.ts";

async function count(db: Db, sql: string, params: (string | number)[] = []): Promise<number> {
  return (await db.all<{ n: number }>(sql, params))[0]?.n ?? 0;
}

async function dryRun(db: Db, llm?: LlmClient, env: Record<string, string> = {}) {
  return runEngine(testConfig({ CLAIMS_PER_ITEM: "10", ...env }), {
    db,
    fetcher: fixtures.fetcher(),
    sources: fixtures.sources(),
    llm,
    now: NOW,
  });
}

describe("engine dry run against fixtures", () => {
  it("fetches, deduplicates, sorts and fact-checks", async () => {
    const db = await testDb();
    const llm = stubClient();
    const s = await dryRun(db, llm);

    expect(s.mode).toBe("dry_run");
    expect(s.publishing).toBe(false);
    // One broken feed fails without stopping the others.
    expect(s.fetch).toMatchObject({ sources: 10, failed: 1 });
    // The second link to the same English story is a duplicate.
    expect(await count(db, "SELECT COUNT(*) AS n FROM engine_items WHERE url LIKE '%richest-one-percent-study%'")).toBe(1);

    const status = Object.fromEntries(
      (await db.all<{ title: string; status: string }>("SELECT title, status FROM engine_items")).map((r) => [r.title, r.status]),
    );
    expect(status["Phone makers report a strong third quarter"]).toBe("irrelevant");
    expect(status["Resultados de la jornada de fútbol"]).toBe("irrelevant");
    expect(status["Billionaire tax vote"]).toBe("topic");
    expect(status["Gini index: most recent value per area"]).toBe("checked");

    // Every model call carried the system prompt.
    expect(llm.calls.length).toBeGreaterThan(0);
    expect(llm.calls.every((c) => c.system === systemPrompt())).toBe(true);
  });

  it("stores supported facts with source, date and verbatim numbers", async () => {
    const db = await testDb();
    await dryRun(db, stubClient());
    const facts = await db.all<FactRef & { source_url: string; status: string; number_text: string; lang: string }>(
      "SELECT * FROM engine_facts WHERE status = 'supported'",
    );
    expect(facts.length).toBeGreaterThan(20);
    for (const f of facts) {
      expect(f.source_url).toMatch(/^https:\/\//);
      expect(f.source_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.claim).toContain(f.number_core);
    }
    const en = facts.find((f) => f.number_text === "US$214 billion");
    expect(en).toMatchObject({ value: 214e9, unit: "USD", source_date: "2026-10-19", lang: "en" });
    // The article page was fetched because the feed only had a teaser; the script tag was ignored.
    expect(facts.some((f) => f.number_text.includes("999"))).toBe(false);
  });

  it("sends hedged claims to the reviewer and drops them", async () => {
    const db = await testDb();
    const llm = stubClient();
    const s = await dryRun(db, llm);
    expect(s.check?.reviewed).toBeGreaterThan(0);
    const dropped = await db.all<{ number_text: string; reviewer_model: string }>(
      "SELECT number_text, reviewer_model FROM engine_facts WHERE status = 'unsupported'",
    );
    expect(dropped.map((d) => d.number_text)).toContain("40%");
    expect(dropped.every((d) => d.reviewer_model === "stub-reviewer")).toBe(true);
  });

  it("lets a post use only numbers from the fact sheet", async () => {
    const db = await testDb();
    await dryRun(db, stubClient());
    const supported = await db.all<FactRef>("SELECT * FROM engine_facts WHERE status = 'supported'");
    const all = await db.all<FactRef>("SELECT * FROM engine_facts");
    expect(verifyPostNumbers("The richest 1% in Indonesia held 31.4% of household wealth.", "en", supported).ok).toBe(true);
    expect(verifyPostNumbers("En México, el 10 % más rico concentra el 57,1 % del ingreso.", "es", supported).ok).toBe(true);
    // 40% exists only as an unsupported fact.
    expect(verifyPostNumbers("Their share could reach 40%.", "en", supported).ok).toBe(false);
    expect(all.length).toBeGreaterThan(supported.length);
  });

  it("resumes without repeating work", async () => {
    const db = await testDb();
    const first = stubClient();
    await dryRun(db, first);
    const items = await count(db, "SELECT COUNT(*) AS n FROM engine_items");
    const facts = await count(db, "SELECT COUNT(*) AS n FROM engine_facts");

    const second = stubClient();
    const s = await dryRun(db, second);
    expect(s.fetch?.added).toBe(0);
    expect(second.calls).toHaveLength(0);
    expect(await count(db, "SELECT COUNT(*) AS n FROM engine_items")).toBe(items);
    expect(await count(db, "SELECT COUNT(*) AS n FROM engine_facts")).toBe(facts);
    expect(await count(db, "SELECT COUNT(*) AS n FROM engine_runs WHERE status = 'ok'")).toBe(2);
  });

  it("waits when no model is available, then continues", async () => {
    // A dry run always has the stub, so this case uses a paid provider with no budget.
    const db2 = await testDb();
    const config = { ...testConfig(), llmProvider: "openrouter" as const, monthlyAiBudgetUsd: 0 };
    const s2 = await runEngine(config, { db: db2, fetcher: fixtures.fetcher(), sources: fixtures.sources(), now: NOW });
    expect(s2.llm).toMatch(/unavailable/);
    expect(s2.sort?.stoppedBy).toBe("no model provider");
    expect(await count(db2, "SELECT COUNT(*) AS n FROM engine_items WHERE status = 'new'")).toBeGreaterThan(0);
    // Datasets need no model; their items wait for the sort step like everything else.
    expect(await count(db2, "SELECT COUNT(*) AS n FROM engine_facts")).toBe(0);

    const s3 = await dryRun(db2, stubClient());
    expect(s3.sort?.sorted).toBeGreaterThan(0);
    expect(await count(db2, "SELECT COUNT(*) AS n FROM engine_facts")).toBeGreaterThan(0);
  });

  it("stops model work cleanly when the budget is reached", async () => {
    const db = await testDb();
    let calls = 0;
    const llm: LlmClient = {
      provider: "openrouter",
      judge: async () => {
        if (++calls > 3) throw new BudgetExceededError(1, 1);
        return { p: 0.95, model: "test" };
      },
      review: async () => {
        throw new BudgetExceededError(1, 1);
      },
    };
    const s = await dryRun(db, llm);
    expect(s.sort?.sorted).toBe(3);
    expect(s.sort?.stoppedBy).toMatch(/budget/);
    expect(await count(db, "SELECT COUNT(*) AS n FROM engine_items WHERE status = 'new'")).toBeGreaterThan(0);
    expect(await count(db, "SELECT COUNT(*) AS n FROM engine_items WHERE status = 'failed'")).toBe(0);
  });

  it("retries a failing item and gives up after three attempts", async () => {
    const db = await testDb();
    const llm: LlmClient = {
      provider: "openrouter",
      judge: async () => {
        throw new Error("HTTP 500");
      },
      review: async () => ({ yes: false, confidence: 1, model: "test" }),
    };
    for (let i = 0; i < 3; i++) await dryRun(db, llm);
    expect(await count(db, "SELECT COUNT(*) AS n FROM engine_items WHERE status = 'new'")).toBe(0);
    expect(await count(db, "SELECT COUNT(*) AS n FROM engine_items WHERE status = 'failed' AND attempts = 3")).toBeGreaterThan(0);
  });
});
