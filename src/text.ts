import { createHash } from "node:crypto";

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  euro: "€", pound: "£", yen: "¥", cent: "¢", deg: "°", times: "×", shy: "",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Plain text from HTML. Drops scripts, styles, navigation and markup. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head\b[\s\S]*?<\/head>/gi, " ")
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

/** Collapses whitespace for display and hashing. Keeps non-breaking spaces as plain spaces. */
export function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|cmpid|ocid|at_medium|at_campaign)$/i;

/** Lower-case host, no fragment, no tracking parameters, no trailing slash. */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const out = url.toString();
  return !url.search && out.endsWith("/") ? out.slice(0, -1) : out;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Hash of the normalised title and text, to catch the same story under different URLs. */
export function contentHash(title: string, text: string): string {
  const norm = (s: string) => squash(s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " "));
  return sha256(`${norm(title)}\n${norm(text)}`);
}

/**
 * Splits text into sentences. A full stop between digits ("1.5") or after a
 * short abbreviation does not end a sentence.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    let start = 0;
    const re = /[.!?…]+["”’»)]*\s+(?=[\p{Lu}\p{N}"“‘«(¿¡])/gu;
    for (const m of para.matchAll(re)) {
      const end = (m.index ?? 0) + m[0].length;
      const before = para.slice(Math.max(0, (m.index ?? 0) - 4), m.index ?? 0);
      if (/\b(?:[A-Z][a-z]?|No|Nr|Dr|Mr|Ms|St|Sr|Sra|Mme|vs|ca|bzw|z\.B|e\.g|i\.e)$/.test(before)) continue;
      out.push(para.slice(start, end).trim());
      start = end;
    }
    const rest = para.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out.filter((s) => s.length > 0);
}

export function isoDate(d: Date | string | undefined | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
