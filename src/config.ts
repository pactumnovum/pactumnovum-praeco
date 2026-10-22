// All configuration comes from environment variables (GitHub Actions secrets and
// variables, or a local .env). Nothing secret is ever written to the repository.

export type LlmProviderName = "openrouter" | "anthropic" | "stub";

export interface D1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export interface Config {
  /** DRY_RUN=1: offline. Fixtures instead of the network, the model stub, a local database. */
  dryRun: boolean;
  /** Kill switch. True only when PUBLISHING_ENABLED is exactly "true". */
  publishingEnabled: boolean;
  llmProvider: LlmProviderName;
  openrouterApiKey?: string;
  anthropicApiKey?: string;
  d1?: D1Config;
  /** Hard stop for model spend per calendar month (UTC). 0 means no paid calls. */
  monthlyAiBudgetUsd: number;
  /** Local SQLite file used when D1 is not configured or in dry run. ":memory:" is allowed. */
  localDbPath: string;
  /** Upper bounds per hourly run, so one run never spends much. */
  limits: {
    sortPerRun: number;
    checkPerRun: number;
    claimsPerItem: number;
    itemsPerFeed: number;
    maxItemAgeDays: number;
  };
}

/** Names of every variable that holds a secret. The logger redacts their values. */
export const SECRET_NAMES = [
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "D1_DATABASE_ID",
  "ZERNIO_API_KEY",
  "BLUESKY_HANDLE",
  "BLUESKY_APP_PASSWORD",
] as const;

type Env = Record<string, string | undefined>;

function nonEmpty(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadConfig(env: Env = process.env): Config {
  const dryRun = env.DRY_RUN === "1" || env.DRY_RUN === "true";

  const provider = nonEmpty(env.LLM_PROVIDER) ?? "openrouter";
  if (provider !== "openrouter" && provider !== "anthropic" && provider !== "stub") {
    throw new Error(`LLM_PROVIDER must be "openrouter" or "anthropic", got "${provider}"`);
  }

  const accountId = nonEmpty(env.CLOUDFLARE_ACCOUNT_ID);
  const databaseId = nonEmpty(env.D1_DATABASE_ID);
  const apiToken = nonEmpty(env.CLOUDFLARE_API_TOKEN);

  return {
    dryRun,
    // Exactly "true". Not "TRUE", not "1", not "yes".
    publishingEnabled: env.PUBLISHING_ENABLED === "true",
    // A dry run never calls a paid model, whatever LLM_PROVIDER says.
    llmProvider: dryRun ? "stub" : provider,
    openrouterApiKey: nonEmpty(env.OPENROUTER_API_KEY),
    anthropicApiKey: nonEmpty(env.ANTHROPIC_API_KEY),
    d1: !dryRun && accountId && databaseId && apiToken ? { accountId, databaseId, apiToken } : undefined,
    monthlyAiBudgetUsd: positiveNumber(env.MONTHLY_AI_BUDGET_USD, 0),
    localDbPath: nonEmpty(env.LOCAL_DB_PATH) ?? (dryRun ? ":memory:" : "data/engine.sqlite"),
    limits: {
      sortPerRun: positiveNumber(env.SORT_PER_RUN, 60),
      checkPerRun: positiveNumber(env.CHECK_PER_RUN, 15),
      claimsPerItem: positiveNumber(env.CLAIMS_PER_ITEM, 6),
      itemsPerFeed: positiveNumber(env.ITEMS_PER_FEED, 20),
      // Fixtures have fixed dates, so a dry run does not filter by age.
      maxItemAgeDays: positiveNumber(env.MAX_ITEM_AGE_DAYS, dryRun ? 36_500 : 7),
    },
  };
}
