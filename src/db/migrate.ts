import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "../log.ts";
import type { Db } from "./types.ts";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

/** Splits a migration file into single statements. Migrations avoid ";" inside strings. */
export function splitStatements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Applies every migration that has not run yet, in file-name order.
 * Statements use IF NOT EXISTS, so a migration that failed half-way can run again.
 */
export async function migrate(db: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await db.run(
    "CREATE TABLE IF NOT EXISTS engine_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const done = new Set(
    (await db.all<{ name: string }>("SELECT name FROM engine_migrations")).map((r) => r.name),
  );
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    for (const statement of splitStatements(readFileSync(join(dir, file), "utf8"))) {
      await db.run(statement);
    }
    await db.run("INSERT INTO engine_migrations (name, applied_at) VALUES (?1, ?2)", [
      file,
      new Date().toISOString(),
    ]);
    applied.push(file);
    log.info("migration applied", { file, db: db.kind });
  }
  return applied;
}
