// Numbers are checked by code, never by a model (CLAUDE.md, section 4, layer 1).
//
// extractNumbers() finds every number in a text with its unit and magnitude.
// containsVerbatim() checks that a number appears in a source text exactly as written.
// verifyPostNumbers() checks that every number in a post comes from the fact sheet.

export type Lang = "en" | "es" | "fr" | "de" | "pt";
export type Unit = "percent" | "USD" | "EUR" | "GBP" | "BRL" | "JPY" | "INR" | "count";

export interface NumberMention {
  /** The full span as written, e.g. "US$1.2 trillion" or "43 %". */
  text: string;
  /** The digits as written, e.g. "1.2" or "1,500,000". */
  core: string;
  start: number;
  end: number;
  /** Parsed value with the magnitude applied (1.2 trillion -> 1.2e12). Percent stays 43. */
  value: number;
  unit: Unit;
  /** A bare four-digit year such as 2026, with no unit or magnitude. */
  isYear: boolean;
  /** A percent, an amount of money, a magnitude word, or a count of 1,000 or more. */
  significant: boolean;
}

const SP = "[ \\u00A0\\u202F\\u2009]";
const THIN = "[\\u00A0\\u202F\\u2009]";

const CURRENCY_PREFIX: [string, Unit][] = [
  ["US$", "USD"], ["USD", "USD"], ["R$", "BRL"], ["EUR", "EUR"], ["GBP", "GBP"],
  ["€", "EUR"], ["$", "USD"], ["£", "GBP"], ["¥", "JPY"], ["₹", "INR"],
];

const CURRENCY_SUFFIX: [string, Unit][] = [
  ["de dólares", "USD"], ["de dollars", "USD"], ["de euros", "EUR"], ["d'euros", "EUR"], ["d’euros", "EUR"],
  ["de reais", "BRL"], ["de dólares estadounidenses", "USD"], ["de dólares americanos", "USD"],
  ["US-Dollar", "USD"], ["dólares", "USD"], ["dollars", "USD"], ["dollar", "USD"], ["dólar", "USD"],
  ["Dollar", "USD"], ["USD", "USD"], ["euros", "EUR"], ["euro", "EUR"], ["Euro", "EUR"], ["EUR", "EUR"],
  ["reais", "BRL"], ["€", "EUR"], ["$", "USD"],
];

const PERCENT = ["por ciento", "pour cent", "por cento", "percent", "per cent", "Prozent", "%"];

// Magnitude words per language. Long scale words ("billón", "Billion" in German)
// mean 10^12; short scale ("billion" in English) means 10^9.
const MAGNITUDES: Record<Lang, [string, number][]> = {
  en: [["trillion", 1e12], ["billion", 1e9], ["million", 1e6], ["thousand", 1e3]],
  es: [["mil millones", 1e9], ["billones", 1e12], ["billón", 1e12], ["millones", 1e6], ["millón", 1e6], ["mil", 1e3]],
  fr: [["mille milliards", 1e12], ["milliards", 1e9], ["milliard", 1e9], ["millions", 1e6], ["million", 1e6], ["billions", 1e12], ["billion", 1e12], ["mille", 1e3]],
  de: [["Billionen", 1e12], ["Billion", 1e12], ["Milliarden", 1e9], ["Milliarde", 1e9], ["Millionen", 1e6], ["Million", 1e6], ["Tausend", 1e3]],
  pt: [["mil milhões", 1e9], ["trilhões", 1e12], ["trilhão", 1e12], ["bilhões", 1e9], ["bilhão", 1e9], ["milhões", 1e6], ["milhão", 1e6], ["mil", 1e3]],
};

// Short forms are only read as magnitudes next to a currency ("$5bn", "€3 Mrd.").
const SHORT_MAGNITUDES: [string, number][] = [
  ["Mrd.", 1e9], ["Mrd", 1e9], ["Mio.", 1e6], ["Mio", 1e6], ["Mds", 1e9], ["Md", 1e9],
  ["tn", 1e12], ["bn", 1e9], ["mn", 1e6], ["m", 1e6], ["k", 1e3],
];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, SP);
}

function alternation(words: string[]): string {
  return [...words].sort((a, b) => b.length - a.length).map(escape).join("|");
}

const patternCache = new Map<Lang, RegExp>();

function pattern(lang: Lang): RegExp {
  const cached = patternCache.get(lang);
  if (cached) return cached;
  // French also groups thousands with a plain space ("1 000 000").
  const group = lang === "fr" ? `(?:[.,]|${SP})` : `(?:[.,]|${THIN})`;
  const num = `\\d{1,3}(?:${group}\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?`;
  const pre = alternation(CURRENCY_PREFIX.map(([w]) => w));
  const mag = alternation([...MAGNITUDES[lang].map(([w]) => w), ...SHORT_MAGNITUDES.map(([w]) => w)]);
  const pct = alternation(PERCENT);
  const suf = alternation(CURRENCY_SUFFIX.map(([w]) => w));
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_][-–]?)(?<![\\p{N}][.,])` +
      `(?:(?<pre>${pre})${SP}?)?` +
      `(?<num>${num})` +
      `(?!\\p{N})(?![.,]\\p{N})` +
      `(?:${SP}?(?<mag>${mag})(?![\\p{L}]))?` +
      `(?:${SP}?(?<pct>${pct})|${SP}?(?<suf>${suf})(?![\\p{L}]))?`,
    "giu",
  );
  patternCache.set(lang, re);
  return re;
}

/** Parses digits as written, using the language's decimal mark when it is ambiguous. */
export function parseCore(core: string, lang: Lang): number {
  const s = core.replace(/[ \u00A0\u202F\u2009]/g, "");
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let decimal: "." | "," | null = null;
  if (dots && commas) decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  else if (dots === 1 || commas === 1) {
    const mark = dots ? "." : ",";
    const after = s.length - s.indexOf(mark) - 1;
    if (after !== 3) decimal = mark;
    else decimal = lang === "en" ? (mark === "." ? "." : null) : mark === "," ? "," : null;
  }
  const thousands = decimal === "." ? /,/g : decimal === "," ? /\./g : /[.,]/g;
  const cleaned = s.replace(thousands, "").replace(",", ".");
  return Number(cleaned);
}

function lookup<T>(table: [string, T][], word: string | undefined): T | undefined {
  if (!word) return undefined;
  const w = word.replace(/[\u00A0\u202F\u2009]/g, " ").toLowerCase();
  return table.find(([k]) => k.toLowerCase() === w)?.[1];
}

export function extractNumbers(text: string, lang: Lang): NumberMention[] {
  const out: NumberMention[] = [];
  for (const m of text.matchAll(pattern(lang))) {
    const g = m.groups ?? {};
    const core = g.num;
    if (!core) continue;
    const currency = lookup(CURRENCY_PREFIX, g.pre) ?? lookup(CURRENCY_SUFFIX, g.suf);
    let magnitude = 1;
    let magText = g.mag;
    if (magText) {
      const long = lookup(MAGNITUDES[lang], magText);
      const short = lookup(SHORT_MAGNITUDES, magText);
      if (long !== undefined) magnitude = long;
      else if (short !== undefined && currency) magnitude = short;
      else magText = undefined; // "5 m" without a currency is not "5 million"
    }
    const unit: Unit = g.pct ? "percent" : (currency ?? "count");
    // Rebuild the span when a short magnitude was rejected, so it does not swallow the letter.
    const start = m.index ?? 0;
    let spanText = m[0];
    if (g.mag && !magText) {
      const idx = spanText.indexOf(core) + core.length;
      spanText = spanText.slice(0, idx);
    }
    spanText = spanText.trimEnd();
    const value = parseCore(core, lang) * magnitude;
    if (!Number.isFinite(value)) continue;
    const isYear = unit === "count" && !magText && /^(1[89]\d\d|20\d\d|2100)$/.test(core);
    const significant = !isYear && (unit !== "count" || magnitude > 1 || value >= 1000);
    out.push({ text: spanText, core, start, end: start + spanText.length, value, unit, isYear, significant });
  }
  return out;
}

function normalizeSpaces(s: string): string {
  return s.normalize("NFKC").replace(/[\u00A0\u202F\u2009]/g, " ");
}

/**
 * True when `core` appears in `source` as a whole number: "1.5" matches in
 * "rose 1.5 points" but not inside "11.52" or "1.50".
 */
export function containsVerbatim(source: string, core: string): boolean {
  const hay = normalizeSpaces(source);
  const needle = normalizeSpaces(core).trim();
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    const before = hay.slice(Math.max(0, i - 2), i);
    const after = hay.slice(i + needle.length, i + needle.length + 2);
    const badBefore = /\d$/.test(before) || /\d[.,]$/.test(before);
    const badAfter = /^\d/.test(after) || /^[.,]\d/.test(after);
    if (!badBefore && !badAfter) return true;
    from = i + 1;
  }
}

export interface FactRef {
  id?: number;
  number_core: string;
  value: number | null;
  unit: string;
  claim: string;
  source_date: string;
}

export interface PostCheck {
  ok: boolean;
  problems: string[];
  usedFacts: number[];
}

function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);
}

/**
 * Every number in a post must match a supported fact (same value and unit, and the
 * fact's digits verbatim in its source sentence), or be a value computed by code.
 * A year passes only if a matched fact mentions it or is dated in it.
 * Any problem means the post is dropped.
 */
export function verifyPostNumbers(
  post: string,
  lang: Lang,
  facts: FactRef[],
  computed: number[] = [],
): PostCheck {
  const problems: string[] = [];
  const used = new Set<number>();
  const mentions = extractNumbers(post, lang);
  const years: NumberMention[] = [];
  for (const m of mentions) {
    if (m.isYear) {
      years.push(m);
      continue;
    }
    if (computed.some((c) => sameValue(m.value, c))) continue;
    const fact = facts.find(
      (f) => f.value !== null && sameValue(m.value, f.value) && f.unit === m.unit && containsVerbatim(f.claim, f.number_core),
    );
    if (!fact) problems.push(`"${m.text}" is not in the fact sheet`);
    else if (fact.id !== undefined) used.add(fact.id);
  }
  const usedFacts = facts.filter((f) => f.id === undefined || used.has(f.id));
  for (const y of years) {
    const known = usedFacts.some((f) => containsVerbatim(f.claim, y.core) || f.source_date.startsWith(y.core));
    if (!known) problems.push(`year "${y.core}" is not supported by a fact used in the post`);
  }
  return { ok: problems.length === 0, problems, usedFacts: [...used] };
}
