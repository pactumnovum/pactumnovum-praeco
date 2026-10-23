# STATUS — praeco

_Updated: 2026-10-23 · dev machine_

## Now
Milestone 1 and layer 3 (answer bank) pass in dry run, CI green. The site side is live. Next: make the `anthropic` provider path work without Jev, then the first live run.

## State
- ✅ Fetch: 11 RSS/Atom feeds (en, es, fr, de, pt), 4 World Bank indicators, Eurostat Gini, 2 report watchers, Bluesky trending topics
- ✅ Sort with Jev (`typesafe/jev-1.14`, Decisions API), threshold 0.90
- ✅ Fact-check: numbers by code, claim support by Jev, Sonnet below 0.90
- ✅ D1 over REST, local SQLite for dry runs, SQL guard, migration 0001
- ✅ Layer 3: `answers/bank.yaml` loaded and validated, Jev picks an entry, text used as written (`src/answers/`). Bank revised 23 Oct; the seven open points are resolved
- ✅ Signature aggregates read per `via`
- ✅ Site side live (22 Oct): `signatures.via` and the anonymous `visits` table exist in D1, the page sends `?via=` with signatures and visit counts
- ✅ Budget meter, secret redaction, 74 tests, ci.yml (tests, type check, gitleaks), engine.yml (hourly)
- 🚧 IMF adapter written but disabled: the DataMapper API returned 403 to non-browser clients
- 🚧 OECD not implemented yet
- 🚧 `facts/core.yaml`: seed fact sheet (29 facts with verbatim quotes, researched 22 Oct) is committed but not yet loaded into the `facts` table or checked against its URLs
- 🚧 Report editions are recorded, but PDF text is not extracted, so they end as `no_source_text`

## Next
1. `LLM_PROVIDER=anthropic` without Jev (CLAUDE.md section 6): Haiku with a constrained JSON choice, confirmed by Sonnet at the same thresholds, for sorting, claim support and answer selection. Test against fixtures, no secrets needed
2. Set secrets and variables, run `engine.yml` by hand, check the first live run's counts
3. Check that `typesafe/jev-1.14` answers with real items and look at the p distribution
4. Answer bank translations (es, fr, de, pt) once the English is approved (people only)
5. Milestone 2: ideas (Haiku), ethics check (Sonnet + Jev per rule), queue
6. Read `visits` aggregates for conversion per `via` (spec settled 23 Oct: CLAUDE.md sections 1 and 7 allow it)
7. Comparisons computed by code (`src/facts/compare.ts`) for "earns in a minute what…" posts

## Watch out
- OpenRouter is not available yet. If that holds, the first live run uses `LLM_PROVIDER=anthropic`, where Jev is not available (Next step 1)
- With `MONTHLY_AI_BUDGET_USD` unset or 0 the engine makes no paid calls; items wait as `new`
- The fact-check asks Sonnet for every claim below p 0.90, including very low ones (as specified); this is the main cost driver
- Without D1 secrets, scheduled runs on Actions end with a warning and do nothing
- One reply decision costs about 37 Jev calls (5 never_reply + 32 entries)

## Run & test
```sh
npm ci && npm test && npm run typecheck
npm run dry
npx tsx src/cli.ts status
```
