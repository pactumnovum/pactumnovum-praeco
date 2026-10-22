import { decodeEntities, squash } from "../text.ts";

export interface ReportLink {
  url: string;
  text: string;
}

/** Links on a report page that match the edition pattern, resolved to absolute URLs. */
export function findReportLinks(html: string, pageUrl: string, linkPattern: string): ReportLink[] {
  const re = new RegExp(linkPattern, "i");
  const seen = new Set<string>();
  const out: ReportLink[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try {
      url = new URL(decodeEntities(m[1]!), pageUrl).toString();
    } catch {
      continue;
    }
    if (!re.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: squash(decodeEntities(m[2]!.replace(/<[^>]+>/g, " "))) });
  }
  return out;
}
