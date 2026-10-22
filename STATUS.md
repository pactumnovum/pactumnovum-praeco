# STATUS — praeco

_Updated: 2026-10-22 · dev machine_

## Now
Milestone 1 (fetch, sort, fact-check) is built and passes in dry run. Waiting for secrets before the first live run.

## State
- ✅ Fetch: 11 RSS/Atom feeds (en, es, fr, de, pt), 4 World Bank indicators, Eurostat Gini, 2 report watchers, Bluesky trending topics
- ✅ Sort with Jev (`typesafe/jev-1.14`, Decisions API), threshold 0.90
- ✅ Fact-check: numbers by code, claim support by Jev, Sonnet below 0.90
- ✅ D1 over REST, local SQLite for dry runs, SQL guard, migration 0001
- ✅ Budget meter, secret redaction, 59 tests, ci.yml (tests, type check, gitleaks), engine.yml (hourly)
- 🚧 IMF adapter written but disabled: the DataMapper API returned 403 to non-browser clients
- 🚧 OECD not implemented yet
- 🚧 Report editions are recorded, but PDF text is not extracted, so they end as `no_source_text`

## Next
1. Set secrets and variables, run `engine.yml` by hand, check the first live run's counts
2. Check that `typesafe/jev-1.14` answers with real items and look at the p distribution
3. Milestone 2: ideas (Haiku), ethics check (Sonnet + Jev per rule), queue, `answers/` skeleton
4. Comparisons computed by code (`src/facts/compare.ts`) for "earns in a minute what…" posts

## Watch out
- With `MONTHLY_AI_BUDGET_USD` unset or 0 the engine makes no paid calls; items wait as `new`
- The fact-check asks Sonnet for every claim below p 0.90, including very low ones (as specified); this is the main cost driver
- Without D1 secrets, scheduled runs on Actions end with a warning and do nothing

## Run & test
```sh
npm ci && npm test && npm run typecheck
npm run dry
npx tsx src/cli.ts status
```
