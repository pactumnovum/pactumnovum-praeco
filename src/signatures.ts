// Aggregate signature numbers from the website's database.
// Only totals, never names or rows. Only the queries approved in db/guard.ts.

import type { Db } from "./db/index.ts";
import { SIGNATURE_QUERIES } from "./db/guard.ts";

export interface SignatureAggregates {
  total: number;
  perCountry: { country: string; n: number }[];
  /** Totals per source code, when the website records one. */
  perSource: { source: string; n: number }[] | null;
}

export async function readSignatureAggregates(db: Db): Promise<SignatureAggregates> {
  const total = (await db.all<{ n: number }>(SIGNATURE_QUERIES.total))[0]?.n ?? 0;
  const perCountry = await db.all<{ country: string; n: number }>(SIGNATURE_QUERIES.perCountry);
  const columns = (await db.all<{ name: string }>(SIGNATURE_QUERIES.columns)).map((r) => r.name);
  const perSource = columns.includes("source")
    ? await db.all<{ source: string; n: number }>(SIGNATURE_QUERIES.perSource)
    : null;
  return { total, perCountry, perSource };
}

/** Daily totals since a date (YYYY-MM-DD), for the brake on unnaturally fast growth. */
export async function signaturesPerDay(db: Db, since: string): Promise<{ day: string; n: number }[]> {
  return db.all<{ day: string; n: number }>(SIGNATURE_QUERIES.perDay, [since]);
}
