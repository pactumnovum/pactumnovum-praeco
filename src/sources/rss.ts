import { XMLParser } from "fast-xml-parser";
import { htmlToText, isoDate } from "../text.ts";

export interface FeedEntry {
  title: string;
  link: string;
  summary: string;
  content: string;
  publishedAt: string | null;
}

type Node = unknown;

function text(node: Node): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("#text" in obj) return text(obj["#text"]);
  }
  return "";
}

function list(node: Node): Record<string, unknown>[] {
  if (node == null) return [];
  return (Array.isArray(node) ? node : [node]) as Record<string, unknown>[];
}

function atomLink(node: Node): string {
  for (const l of list(node)) {
    const rel = l["@_rel"];
    if ((rel === undefined || rel === "alternate") && typeof l["@_href"] === "string") return l["@_href"];
  }
  return typeof node === "string" ? node : "";
}

/** Parses RSS 2.0, RSS 1.0 (RDF) and Atom. Returns entries with plain text fields. */
export function parseFeed(xml: string): FeedEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    processEntities: true,
    htmlEntities: true,
    trimValues: true,
  });
  const doc = parser.parse(xml) as Record<string, any>;
  const out: FeedEntry[] = [];

  const rssItems = list(doc?.rss?.channel?.item).concat(list(doc?.["rdf:RDF"]?.item));
  for (const it of rssItems) {
    out.push({
      title: htmlToText(text(it.title)),
      link: text(it.link) || text(it.guid),
      summary: htmlToText(text(it.description)),
      content: htmlToText(text(it["content:encoded"]) || text(it.description)),
      publishedAt: isoDate(text(it.pubDate) || text(it["dc:date"])),
    });
  }

  for (const e of list(doc?.feed?.entry)) {
    out.push({
      title: htmlToText(text(e.title)),
      link: atomLink(e.link),
      summary: htmlToText(text(e.summary)),
      content: htmlToText(text(e.content) || text(e.summary)),
      publishedAt: isoDate(text(e.published) || text(e.updated)),
    });
  }

  return out.filter((e) => e.title && e.link);
}
