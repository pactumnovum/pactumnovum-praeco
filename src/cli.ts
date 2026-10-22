// praeco command line.
//   run      one engine run (fetch, sort, fact-check)
//   migrate  apply database migrations
//   status   counts per item and fact status
//   answer   pick a reply from the answer bank: answer <short|long> <via> "<message>"

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadBank } from "./answers/bank.ts";
import { selectAnswer } from "./answers/select.ts";
import { loadConfig } from "./config.ts";
import { openDb } from "./db/index.ts";
import { migrate } from "./db/migrate.ts";
import { VIA, type Via } from "./links.ts";
import { createLlm } from "./llm/index.ts";
import { errorMessage, log, registerSecrets } from "./log.ts";
import { FIXTURES_DIR, fixtureFetcher, httpFetcher } from "./net.ts";
import { runEngine } from "./pipeline.ts";
import { loadSources } from "./sources/config.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
process.env.TZ = "UTC";
registerSecrets();

const LIVE_SOURCES = fileURLToPath(new URL("../config/sources.json", import.meta.url));
const FIXTURE_SOURCES = `${FIXTURES_DIR}sources.json`;

async function main(command: string): Promise<number> {
  const config = loadConfig();

  if (!config.dryRun && !config.d1 && process.env.GITHUB_ACTIONS === "true") {
    // Before the database secrets exist, scheduled runs end quietly instead of failing every hour.
    console.log("::warning::D1 is not configured (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID). Nothing to do.");
    return 0;
  }

  const db = openDb(config);
  try {
    if (command === "migrate") {
      const applied = await migrate(db);
      log.info("migrations", { applied, db: db.kind });
      return 0;
    }
    if (command === "status") {
      await migrate(db);
      const items = await db.all("SELECT kind, status, COUNT(*) AS n FROM engine_items GROUP BY kind, status ORDER BY kind, status");
      const facts = await db.all("SELECT status, COUNT(*) AS n FROM engine_facts GROUP BY status");
      const spend = await db.all("SELECT month, ROUND(SUM(cost_usd), 4) AS usd FROM engine_llm_calls GROUP BY month ORDER BY month DESC LIMIT 3");
      console.log(JSON.stringify({ db: db.kind, items, facts, spend }, null, 2));
      return 0;
    }
    if (command === "run") {
      const summary = await runEngine(config, {
        db,
        fetcher: config.dryRun ? fixtureFetcher() : httpFetcher(),
        sources: loadSources(config.dryRun ? FIXTURE_SOURCES : LIVE_SOURCES),
      });
      return summary.fetch && summary.fetch.failed === summary.fetch.sources && summary.fetch.sources > 0 ? 1 : 0;
    }
    if (command === "answer") {
      const [channel, via, ...words] = process.argv.slice(3);
      if ((channel !== "short" && channel !== "long") || !VIA.includes(via as Via) || words.length === 0) {
        console.error(`usage: tsx src/cli.ts answer <short|long> <${VIA.join("|")}> "<message>"`);
        return 2;
      }
      await migrate(db);
      const decision = await selectAnswer(createLlm(config, db), loadBank(), {
        message: words.join(" "),
        channel,
        via: via as Via,
      });
      console.log(JSON.stringify(decision, null, 2));
      return 0;
    }
    console.error("usage: tsx src/cli.ts run | migrate | status | answer");
    return 2;
  } finally {
    await db.close();
  }
}

main(process.argv[2] ?? "run")
  .then((code) => process.exit(code))
  .catch((err) => {
    log.error("engine failed", { error: errorMessage(err) });
    process.exit(1);
  });
