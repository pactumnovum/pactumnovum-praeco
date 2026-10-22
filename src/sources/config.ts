import { readFileSync } from "node:fs";
import type { ItemLang } from "../items.ts";

export interface FeedSource {
  id: string;
  name: string;
  lang: Exclude<ItemLang, "und">;
  url: string;
  enabled?: boolean;
}

export interface DatasetSource {
  id: string;
  name: string;
  kind: "worldbank" | "eurostat" | "imf";
  url: string;
  /** The page a reader can open, shown as the source of every number. */
  pageUrl: string;
  unit: "percent" | "count";
  enabled?: boolean;
}

export interface ReportSource {
  id: string;
  name: string;
  url: string;
  /** Regular expression that matches links to report editions on the page. */
  linkPattern: string;
  enabled?: boolean;
}

export interface TopicSource {
  id: string;
  name: string;
  kind: "bluesky-trending";
  url: string;
  enabled?: boolean;
}

export interface SourcesConfig {
  feeds: FeedSource[];
  datasets: DatasetSource[];
  reports: ReportSource[];
  topics: TopicSource[];
}

export function loadSources(path: string): SourcesConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<SourcesConfig>;
  const on = <T extends { enabled?: boolean }>(list: T[] | undefined) => (list ?? []).filter((s) => s.enabled !== false);
  return { feeds: on(raw.feeds), datasets: on(raw.datasets), reports: on(raw.reports), topics: on(raw.topics) };
}
