# STATUS — praeco

_Updated: 2026-10-22 · dev machine_

## Now
Pushed to GitHub (`origin/main`). Milestone 1 and layer 3 (answer bank) pass in dry run. Next is the first live run, which needs secrets.

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
1. Check that `ci.yml` passed on the first push
2. Set secrets and variables, run `engine.yml` by hand, check the first live run's counts
3. Check that `typesafe/jev-1.14` answers with real items and look at the p distribution
4. Decide the open answer bank points below, then edit `answers/bank.yaml` (people only)
5. Milestone 2: ideas (Haiku), ethics check (Sonnet + Jev per rule), queue
6. Read `visits` aggregates for conversion per `via`: CLAUDE.md section 7 describes the table, but sections 1 and 7 still say only `signatures` may be read, so settle the spec first
7. Comparisons computed by code (`src/facts/compare.ts`) for "earns in a minute what…" posts

## Watch out
- OpenRouter is not available yet. If that holds, the first live run uses `LLM_PROVIDER=anthropic`, where Jev is not available (CLAUDE.md section 6). Check that sorting, fact-check and answer selection work on that path before relying on it
- With `MONTHLY_AI_BUDGET_USD` unset or 0 the engine makes no paid calls; items wait as `new`
- The fact-check asks Sonnet for every claim below p 0.90, including very low ones (as specified); this is the main cost driver
- Without D1 secrets, scheduled runs on Actions end with a warning and do nothing
- Answer bank points that need a human decision (the engine uses the text as is):
  - `article-6-ai` long lists bans that are not in Article VI (fake profiles, false urgency); the pact names discrimination, manipulation, surveillance or social ranking, and concentrating power
  - `who-pays` long says something about the founder, against system prompt rule 3 and the bank's own rule
  - `is-this-ai` and `who-is-behind` long say every reply is written by AI, but replies come from this bank
  - `bots` long describes a signature brake that arrives in milestone 4
  - `article-4-fund`, `ai-manages-money`: "half are people it serves", "every decision can be appealed", "can overrule it" go further than the pact text
  - `withdraw`, `how-to-help` short name the domain without `link: true`; X turns it into a link
  - `privacy` short leaves out that the visit source (`via`) is stored
- One reply decision costs about 37 Jev calls (5 never_reply + 32 entries)

## Run & test
```sh
npm ci && npm test && npm run typecheck
npm run dry
npx tsx src/cli.ts status
```
