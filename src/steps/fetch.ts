// Step 1: fetch. RSS feeds, open data APIs, report pages and public topics.
// No model calls. Deduplicates by normalised URL and content hash.

import { insertItem, type NewItem } from "../items.ts";
import { errorMessage, log } from "../log.ts";
import { parseTrendingTopics } from "../sources/bluesky.ts";
import {
  parseImfDataMapper,
  parseJsonStat,
  parseWorldBank,
  rowsToBody,
  type ParsedDataset,
} from "../sources/datasets.ts";
import type { DatasetSource } from "../sources/config.ts";
import { findReportLinks } from "../sources/reports.ts";
import { parseFeed } from "../sources/rss.ts";
import { normalizeUrl, sha256 } from "../text.ts";
import type { StepContext } from "./context.ts";

export interface FetchSummary {
  sources: number;
  failed: number;
  found: number;
  added: number;
}

async function getOk(ctx: StepContext, url: string, accept: string): Promise<string> {
  const page = await ctx.fetcher.get(url, { accept });
  if (page.status < 200 || page.status >= 300) throw new Error(`HTTP ${page.status}`);
  return page.text;
}

function parseDataset(source: DatasetSource, text: string): ParsedDataset {
  const json = JSON.parse(text) as unknown;
  if (source.kind === "worldbank") return parseWorldBank(json);
  if (source.kind === "eurostat") return parseJsonStat(json);
  return parseImfDataMapper(json, source.name);
}

async function feedItems(ctx: StepContext): Promise<{ id: string; items: () => Promise<NewItem[]> }[]> {
  const cutoff = ctx.now.getTime() - ctx.config.limits.maxItemAgeDays * 86_400_000;
  return ctx.sources.feeds.map((feed) => ({
    id: feed.id,
    items: async () => {
      const entries = parseFeed(await getOk(ctx, feed.url, "application/rss+xml, application/atom+xml, application/xml, text/xml"));
      return entries
        .filter((e) => !e.publishedAt || Date.parse(e.publishedAt) >= cutoff)
        .slice(0, ctx.config.limits.itemsPerFeed)
        .map((e) => ({
          dedupeKey: normalizeUrl(e.link),
          url: e.link,
          sourceId: feed.id,
          sourceName: feed.name,
          kind: "article" as const,
          lang: feed.lang,
          title: e.title,
          summary: e.summary,
          body: e.content,
          publishedAt: e.publishedAt,
        }));
    },
  }));
}

function datasetItems(ctx: StepContext) {
  return ctx.sources.datasets.map((source) => ({
    id: source.id,
    items: async (): Promise<NewItem[]> => {
      const parsed = parseDataset(source, await getOk(ctx, source.url, "application/json"));
      if (parsed.rows.length === 0) return [];
      const body = rowsToBody(parsed.rows);
      const edition = parsed.updated ?? sha256(body).slice(0, 16);
      return [
        {
          dedupeKey: `${source.kind}:${source.id}:${edition}`,
          url: source.pageUrl,
          sourceId: source.id,
          sourceName: source.name,
          kind: "dataset",
          lang: "en",
          title: `${parsed.title || source.name}: most recent value per area`,
          summary: `${parsed.rows.length} values from ${source.name}.`,
          body,
          publishedAt: parsed.updated ? new Date(parsed.updated).toISOString() : null,
        },
      ];
    },
  }));
}

function reportItems(ctx: StepContext) {
  return ctx.sources.reports.map((source) => ({
    id: source.id,
    items: async (): Promise<NewItem[]> => {
      const links = findReportLinks(await getOk(ctx, source.url, "text/html"), source.url, source.linkPattern);
      return links.slice(0, 5).map((l) => ({
        dedupeKey: normalizeUrl(l.url),
        url: l.url,
        sourceId: source.id,
        sourceName: source.name,
        kind: "report",
        lang: "en",
        title: l.text ? `${source.name}: ${l.text}` : source.name,
        summary: `New edition link found on ${source.url}`,
        body: "",
        publishedAt: null,
      }));
    },
  }));
}

function topicItems(ctx: StepContext) {
  const day = ctx.now.toISOString().slice(0, 10);
  return ctx.sources.topics.map((source) => ({
    id: source.id,
    items: async (): Promise<NewItem[]> =>
      parseTrendingTopics(JSON.parse(await getOk(ctx, source.url, "application/json"))).map((t) => ({
        dedupeKey: `topic:${source.id}:${t.topic.toLowerCase()}:${day}`,
        url: t.link.startsWith("/") ? `https://bsky.app${t.link}` : "https://bsky.app",
        sourceId: source.id,
        sourceName: source.name,
        kind: "topic",
        lang: "und",
        title: t.displayName,
        summary: t.description,
        body: "",
        publishedAt: ctx.now.toISOString(),
      })),
  }));
}

export async function fetchStep(ctx: StepContext): Promise<FetchSummary> {
  const all = [...(await feedItems(ctx)), ...datasetItems(ctx), ...reportItems(ctx), ...topicItems(ctx)];
  const summary: FetchSummary = { sources: all.length, failed: 0, found: 0, added: 0 };
  for (const source of all) {
    try {
      const items = await source.items();
      summary.found += items.length;
      for (const item of items) {
        if (await insertItem(ctx.db, item, ctx.now)) summary.added++;
      }
      await ctx.db.run(
        "INSERT INTO engine_source_state (source_id, last_checked, last_error) VALUES (?1, ?2, NULL) " +
          "ON CONFLICT (source_id) DO UPDATE SET last_checked = excluded.last_checked, last_error = NULL",
        [source.id, ctx.now.toISOString()],
      );
    } catch (err) {
      summary.failed++;
      const message = errorMessage(err);
      log.warn("source failed", { source: source.id, error: message });
      await ctx.db.run(
        "INSERT INTO engine_source_state (source_id, last_checked, last_error) VALUES (?1, ?2, ?3) " +
          "ON CONFLICT (source_id) DO UPDATE SET last_checked = excluded.last_checked, last_error = excluded.last_error",
        [source.id, ctx.now.toISOString(), message],
      );
    }
  }
  log.info("fetch done", { ...summary });
  return summary;
}
