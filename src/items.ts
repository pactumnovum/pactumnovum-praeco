import type { Db } from "./db/index.ts";
import { contentHash } from "./text.ts";

export type ItemKind = "article" | "dataset" | "report" | "topic";
export type ItemLang = "en" | "es" | "fr" | "de" | "pt" | "und";

export const MAX_BODY_CHARS = 30_000;

export interface NewItem {
  dedupeKey: string;
  url: string;
  sourceId: string;
  sourceName: string;
  kind: ItemKind;
  lang: ItemLang;
  title: string;
  summary: string;
  body: string;
  publishedAt: string | null;
}

export interface ItemRow {
  id: number;
  dedupe_key: string;
  url: string;
  source_id: string;
  source_name: string;
  kind: ItemKind;
  lang: ItemLang;
  title: string;
  summary: string;
  body: string;
  published_at: string | null;
  fetched_at: string;
  status: string;
  attempts: number;
}

/** Inserts an item unless its key or content hash is already known. Returns true if new. */
export async function insertItem(db: Db, item: NewItem, now: Date): Promise<boolean> {
  const hash = contentHash(item.title, item.kind === "dataset" ? item.body : `${item.summary}\n${item.body}`);
  const r = await db.run(
    "INSERT OR IGNORE INTO engine_items " +
      "(dedupe_key, content_hash, url, source_id, source_name, kind, lang, title, summary, body, published_at, fetched_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    [
      item.dedupeKey,
      hash,
      item.url,
      item.sourceId,
      item.sourceName,
      item.kind,
      item.lang,
      item.title.slice(0, 500),
      item.summary.slice(0, 2000),
      item.body.slice(0, MAX_BODY_CHARS),
      item.publishedAt,
      now.toISOString(),
    ],
  );
  return r.changes > 0;
}
