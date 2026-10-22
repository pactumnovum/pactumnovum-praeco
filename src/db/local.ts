import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { guardSql } from "./guard.ts";
import type { Db, Param, Row, RunResult } from "./types.ts";

/** Local SQLite (built into Node 24). Same SQL dialect as D1. */
export function openLocalDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  return {
    kind: "local",
    async all<T = Row>(sql: string, params: Param[] = []): Promise<T[]> {
      guardSql(sql);
      return db.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, params: Param[] = []): Promise<RunResult> {
      guardSql(sql);
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastRowId: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) };
    },
    async close() {
      db.close();
    },
  };
}
