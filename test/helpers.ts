import { loadConfig, type Config } from "../src/config.ts";
import { openLocalDb } from "../src/db/local.ts";
import { migrate } from "../src/db/migrate.ts";
import type { Db } from "../src/db/index.ts";
import { FIXTURES_DIR, fixtureFetcher } from "../src/net.ts";
import { loadSources } from "../src/sources/config.ts";

export const NOW = new Date("2026-10-22T12:00:00Z");

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ DRY_RUN: "1", LOCAL_DB_PATH: ":memory:", ...env });
}

export async function testDb(): Promise<Db> {
  const db = openLocalDb(":memory:");
  await migrate(db);
  return db;
}

export const fixtures = {
  fetcher: () => fixtureFetcher(),
  sources: () => loadSources(`${FIXTURES_DIR}sources.json`),
};
