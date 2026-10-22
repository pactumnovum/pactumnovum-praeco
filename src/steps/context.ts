import type { Config } from "../config.ts";
import type { Db } from "../db/index.ts";
import type { LlmClient } from "../llm/index.ts";
import type { Fetcher } from "../net.ts";
import type { SourcesConfig } from "../sources/config.ts";

export interface StepContext {
  config: Config;
  db: Db;
  fetcher: Fetcher;
  sources: SourcesConfig;
  /** Undefined when no model provider is available. Steps that need one then wait. */
  llm?: LlmClient;
  now: Date;
}

/** Probability threshold for every Jev decision (CLAUDE.md, section 5). */
export const THRESHOLD = 0.9;

export const QUESTIONS = {
  sort: "Does this clearly show the gap between rich and poor?",
  support:
    "Does the source text support the claim as a documented fact, with each number meaning the same thing as in the source?",
} as const;
