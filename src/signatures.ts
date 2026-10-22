// Aggregate signature numbers from the website's database.
// Only totals, never names or rows. Only the queries approved in db/guard.ts.

import type { Db } from "./db/index.ts";
import { SIGNATURE_QUERIES } from "./db/guard.ts";

export interface SignatureAggregates {
  total: number;
  perCountry: { country: string; n: number }[];
  /** Totals per `via` (the channel a signer came from), when the website records it. */
  perVia: { via: string; n: number }[] | null;
}

export async function readSignatureAggregates(db: Db): Promise<SignatureAggregates> {
  const total = (await db.all<{ n: number }>(SIGNATURE_QUERIES.total))[0]?.n ?? 0;
  const perCountry = await db.all<{ country: string; n: number }>(SIGNATURE_QUERIES.perCountry);
  const columns = (await db.all<{ name: string }>(SIGNATURE_QUERIES.columns)).map((r) => r.name);
  const perVia = columns.includes("via") ? await db.all<{ via: string; n: number }>(SIGNATURE_QUERIES.perVia) : null;
  return { total, perCountry, perVia };
}

/** Daily totals since a date (YYYY-MM-DD), for the brake on unnaturally fast growth. */
export async function signaturesPerDay(db: Db, since: string): Promise<{ day: string; n: number }[]> {
  return db.all<{ day: string; n: number }>(SIGNATURE_QUERIES.perDay, [since]);
}
