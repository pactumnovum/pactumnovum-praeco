// The approved answer bank (CLAUDE.md, section 4, layer 3).
// answers/bank.yaml is written and approved by people. The engine never edits it,
// never paraphrases it and never generates replies of its own. It only picks an entry.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { LONGEST_LINK } from "../links.ts";
import { systemPrompt } from "../llm/prompt.ts";
import { sha256 } from "../text.ts";

export const BANK_PATH = fileURLToPath(new URL("../../answers/bank.yaml", import.meta.url));

export const SHORT_MAX_CHARS = 280;
export const LONG_MAX_WORDS = 150;

export interface BankEntry {
  id: string;
  intent: string;
  /** Social replies. A tracked link is added by code only when `link` is true. */
  short: string;
  /** Press and email replies. */
  long: string;
  link: boolean;
}

export interface Bank {
  version: 1;
  standard: { founder: string; decline: string; formal: string };
  neverReply: string[];
  entries: BankEntry[];
  /** SHA-256 of the file, logged with every reply so it is clear which version was used. */
  hash: string;
}

export class BankError extends Error {
  constructor(public readonly problems: string[]) {
    super(`answer bank rejected: ${problems.join("; ")}`);
    this.name = "BankError";
  }
}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const charCount = (s: string) => [...s].length;
const wordCount = (s: string) => s.trim().split(/\s+/).length;
const hasUrl = (s: string) => /\b(?:https?:\/\/|www\.)/i.test(s);

/** The founder answer quoted in the system prompt, rule 3. */
export function systemStandardAnswer(): string {
  const m = systemPrompt().match(/Standard answer to any question about the founder: "([^"]+)"/);
  if (!m?.[1]) throw new Error("system prompt has no standard answer");
  return m[1];
}

/**
 * Checks the bank against the rules in its own header and in CLAUDE.md.
 * Any problem rejects the whole bank: the engine then stays silent.
 */
export function validateBank(raw: unknown): string[] {
  const problems: string[] = [];
  const doc = raw as Record<string, unknown> | null;
  if (!doc || typeof doc !== "object") return ["the file is not a YAML mapping"];

  for (const key of Object.keys(doc)) {
    if (!["version", "standard", "never_reply", "entries"].includes(key)) problems.push(`unknown key "${key}"`);
  }
  if (doc.version !== 1) problems.push("version must be 1");

  const standard = doc.standard as Record<string, unknown> | undefined;
  for (const key of ["founder", "decline", "formal"]) {
    if (!isText(standard?.[key])) problems.push(`standard.${key} is missing`);
    else if (hasUrl(standard[key] as string)) problems.push(`standard.${key} contains a link`);
  }
  if (isText(standard?.founder) && standard.founder !== systemStandardAnswer()) {
    problems.push("standard.founder differs from the standard answer in the system prompt");
  }

  const never = doc.never_reply;
  if (!Array.isArray(never) || never.length === 0 || !never.every(isText)) {
    problems.push("never_reply must be a non-empty list of intents");
  }

  const entries = doc.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    problems.push("entries must be a non-empty list");
    return problems;
  }
  const ids = new Set<string>();
  entries.forEach((e: Record<string, unknown>, i) => {
    const where = isText(e?.id) ? `entry "${e.id}"` : `entry #${i + 1}`;
    for (const key of Object.keys(e ?? {})) {
      if (!["id", "intent", "short", "long", "link"].includes(key)) problems.push(`${where}: unknown key "${key}"`);
    }
    for (const key of ["id", "intent", "short", "long"]) {
      if (!isText(e?.[key])) problems.push(`${where}: ${key} is missing`);
    }
    if (e?.link !== undefined && typeof e.link !== "boolean") problems.push(`${where}: link must be true or false`);
    if (isText(e?.id)) {
      if (!/^[a-z0-9-]+$/.test(e.id)) problems.push(`${where}: id must be lower-case words joined by "-"`);
      if (ids.has(e.id)) problems.push(`${where}: duplicate id`);
      ids.add(e.id);
    }
    if (isText(e?.short)) {
      const withLink = e.link === true ? `${e.short}\n${LONGEST_LINK}` : e.short;
      if (charCount(withLink) > SHORT_MAX_CHARS) problems.push(`${where}: short is over ${SHORT_MAX_CHARS} characters`);
      if (hasUrl(e.short)) problems.push(`${where}: short contains a link; set link: true instead`);
    }
    if (isText(e?.long)) {
      if (wordCount(e.long) > LONG_MAX_WORDS) problems.push(`${where}: long is over ${LONG_MAX_WORDS} words`);
      if (hasUrl(e.long)) problems.push(`${where}: long contains a link`);
    }
  });
  return problems;
}

export function parseBank(text: string): Bank {
  const raw = parse(text) as Record<string, any>;
  const problems = validateBank(raw);
  if (problems.length > 0) throw new BankError(problems);
  return {
    version: 1,
    standard: { founder: raw.standard.founder, decline: raw.standard.decline, formal: raw.standard.formal },
    neverReply: [...raw.never_reply],
    entries: raw.entries.map((e: Record<string, unknown>) => ({
      id: e.id as string,
      intent: e.intent as string,
      short: e.short as string,
      long: e.long as string,
      link: e.link === true,
    })),
    hash: sha256(text),
  };
}

export function loadBank(path: string = BANK_PATH): Bank {
  return parseBank(readFileSync(path, "utf8"));
}
