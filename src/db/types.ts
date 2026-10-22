export type Param = string | number | null;
export type Row = Record<string, unknown>;

export interface RunResult {
  changes: number;
  lastRowId: number | null;
}

/**
 * The engine's only way to reach a database. Two implementations share it:
 * Cloudflare D1 over the REST API, and local SQLite for dry runs and tests.
 * Both pass every statement through guardSql().
 */
export interface Db {
  readonly kind: "d1" | "local";
  all<T = Row>(sql: string, params?: Param[]): Promise<T[]>;
  run(sql: string, params?: Param[]): Promise<RunResult>;
  close(): Promise<void>;
}
