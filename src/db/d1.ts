import type { D1Config } from "../config.ts";
import { guardSql } from "./guard.ts";
import type { Db, Param, Row, RunResult } from "./types.ts";

interface D1Response {
  success: boolean;
  errors?: { code?: number; message?: string }[];
  result?: { results?: unknown[]; success?: boolean; meta?: { changes?: number; last_row_id?: number } }[];
}

/**
 * Cloudflare D1 through the REST API. The token must be limited to D1 read/write.
 * Error messages carry the HTTP status and D1's own error text, never the request
 * headers, and never row data.
 */
export function openD1(cfg: D1Config, fetchImpl: typeof fetch = fetch): Db {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.accountId)}` +
    `/d1/database/${encodeURIComponent(cfg.databaseId)}/query`;

  async function query(sql: string, params: Param[]) {
    guardSql(sql);
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(30_000),
    });
    let body: D1Response | undefined;
    try {
      body = (await res.json()) as D1Response;
    } catch {
      body = undefined;
    }
    if (!res.ok || !body?.success) {
      const reason = body?.errors?.map((e) => e.message ?? String(e.code)).join("; ") || "no error detail";
      throw new Error(`D1 query failed (HTTP ${res.status}): ${reason.slice(0, 200)}`);
    }
    const first = body.result?.[0];
    return { rows: (first?.results ?? []) as unknown[], meta: first?.meta ?? {} };
  }

  return {
    kind: "d1",
    async all<T = Row>(sql: string, params: Param[] = []): Promise<T[]> {
      return (await query(sql, params)).rows as T[];
    },
    async run(sql: string, params: Param[] = []): Promise<RunResult> {
      const { meta } = await query(sql, params);
      return { changes: meta.changes ?? 0, lastRowId: meta.last_row_id ?? null };
    },
    async close() {},
  };
}
