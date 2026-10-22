# praeco

The engine that speaks for [Pactum Novum](https://pactumnovum.org). It watches the
news and open data, keeps a fact sheet of documented numbers about inequality, and
(in later milestones) turns them into posts that are checked against the pact
before anything is published.

`CLAUDE.md` is the full specification. This file is the short version.

## Run

Node 24 or later.

```sh
npm ci
npm test            # unit and pipeline tests, offline
npm run typecheck
npm run dry         # one full engine run against fixtures/, no network, no paid calls
npm run engine      # one real run (needs the variables in .env.example)
npx tsx src/cli.ts status
```

`DRY_RUN=1` means: fixtures instead of the network, the model stub instead of a
paid model, and an in-memory database. Tests never call paid APIs.

## What one run does (milestone 1)

1. **Fetch** (`src/steps/fetch.ts`). RSS and Atom feeds in English, Spanish, French,
   German and Portuguese; World Bank and Eurostat data; new report editions (UBS,
   Oxfam); Bluesky's public trending topics. Deduplicated by normalised URL and
   content hash. Sources are listed in `config/sources.json`.
2. **Sort** (`src/steps/sort.ts`). One question per item to Jev: *"Does this clearly
   show the gap between rich and poor?"* Only `p ≥ 0.90` continues.
3. **Fact-check** (`src/steps/factcheck.ts`). Code extracts every significant number
   from the source text and checks it appears there verbatim. Jev judges whether the
   source supports each claim; below 0.90, Claude Sonnet 5.5 decides. Unsupported
   claims are stored as `unsupported` and never used. Values from open data APIs are
   structured, so code reads them directly.

Every step reads from and writes to the database, so an interrupted run continues
the next hour without repeating paid work.

## Rules enforced in code

| Rule | Where |
|---|---|
| Only `engine_` tables; `signatures` only through fixed aggregate queries | `src/db/guard.ts` (every statement passes through it) |
| Every number in a post must come from the fact sheet | `verifyPostNumbers` in `src/facts/numbers.ts` |
| The system prompt goes with every model call, loaded from `prompts/system.md` | `src/llm/prompt.ts`, tested against `CLAUDE.md` |
| Text from outside is wrapped as data | `asData` in `src/llm/prompt.ts` |
| Monthly model budget; unset means no paid calls | `src/llm/meter.ts` |
| Publishing only when `PUBLISHING_ENABLED` is exactly `true` | `src/config.ts` |
| No secrets in logs | `src/log.ts` |
| Secret scan on every push | `.github/workflows/ci.yml` (gitleaks) |

## Models

All calls go through `src/llm/`. Slugs were checked on the providers; see `src/llm/models.ts`.

| Use | OpenRouter (default) | Anthropic (fallback) |
|---|---|---|
| Yes/no judgements | `typesafe/jev-1.14` via `POST /api/alpha/decisions` (one `noul` question per call) | `claude-haiku-5-5` with a JSON yes/no, confirmed by `claude-sonnet-5-5` |
| Reviews | `anthropic/claude-sonnet-5.5` | `claude-sonnet-5-5` |
| Writing (milestone 2) | `anthropic/claude-haiku-5.5` | `claude-haiku-5-5` |

Jev has no system field, so the system prompt travels in `state.rules`.

## Layout

```
config/sources.json   live sources
fixtures/             invented test data and the dry-run source list
migrations/           D1 schema (engine_ tables only)
prompts/system.md     the system prompt, word for word
src/db/               D1 over REST, local SQLite, migrations, SQL guard
src/facts/            number extraction and verification
src/llm/              model clients, stub, budget meter
src/sources/          feed, dataset, report and topic parsers
src/steps/            fetch, sort, fact-check
test/                 Vitest
```
