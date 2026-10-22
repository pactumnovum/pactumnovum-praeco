# STATUS — praeco

_Updated: 2026-10-22 · dev machine_

## Now
Milestone 1 is built and passes in dry run. Layer 3 (answer bank) is in place as a library. Waiting for secrets before the first live run.

## State
- ✅ Fetch: 11 RSS/Atom feeds (en, es, fr, de, pt), 4 World Bank indicators, Eurostat Gini, 2 report watchers, Bluesky trending topics
- ✅ Sort with Jev (`typesafe/jev-1.14`, Decisions API), threshold 0.90
- ✅ Fact-check: numbers by code, claim support by Jev, Sonnet below 0.90
- ✅ D1 over REST, local SQLite for dry runs, SQL guard, migration 0001
- ✅ Layer 3: `answers/bank.yaml` loaded and validated, Jev picks an entry, text used as written (`src/answers/`)
- ✅ Signature aggregates read per `via`
- ✅ Budget meter, secret redaction, 74 tests, ci.yml (tests, type check, gitleaks), engine.yml (hourly)
- 🚧 IMF adapter written but disabled: the DataMapper API returned 403 to non-browser clients
- 🚧 OECD not implemented yet
- 🚧 Report editions are recorded, but PDF text is not extracted, so they end as `no_source_text`

## Next
1. Set secrets and variables, run `engine.yml` by hand, check the first live run's counts
2. Check that `typesafe/jev-1.14` answers with real items and look at the p distribution
3. Milestone 2: ideas (Haiku), ethics check (Sonnet + Jev per rule), queue
4. Read `visits` aggregates for conversion per `via` (CLAUDE.md now allows it; the SQL guard does not yet)
5. Comparisons computed by code (`src/facts/compare.ts`) for "earns in a minute what…" posts

## Watch out
- With `MONTHLY_AI_BUDGET_USD` unset or 0 the engine makes no paid calls; items wait as `new`
- The fact-check asks Sonnet for every claim below p 0.90, including very low ones (as specified); this is the main cost driver
- Without D1 secrets, scheduled runs on Actions end with a warning and do nothing
- Answer bank: a few entries need a human decision (see the review notes from 2026-10-22); the engine uses the text as is
- One reply decision costs about 37 Jev calls (5 never_reply + 32 entries)

## Run & test
```sh
npm ci && npm test && npm run typecheck
npm run dry
npx tsx src/cli.ts status
```
