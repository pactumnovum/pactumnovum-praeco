-- Milestone 1: fetch, sort, fact-check.
-- Every table is prefixed engine_. The engine never creates, changes or writes other tables.

-- One row per hourly run. summary holds counts only, never content or secrets.
CREATE TABLE IF NOT EXISTS engine_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  mode         TEXT NOT NULL,              -- dry_run | live
  status       TEXT NOT NULL,              -- running | ok | error
  summary      TEXT
);

-- Everything the fetch step finds: articles, data sets, report editions, topics.
CREATE TABLE IF NOT EXISTS engine_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key    TEXT NOT NULL UNIQUE,      -- normalised URL, or a stable key for API data
  content_hash  TEXT NOT NULL UNIQUE,      -- SHA-256 of normalised title and text
  url           TEXT NOT NULL,             -- the source a reader can open
  source_id     TEXT NOT NULL,
  source_name   TEXT NOT NULL,
  kind          TEXT NOT NULL,             -- article | dataset | report | topic
  lang          TEXT NOT NULL,             -- en | es | fr | de | pt | und
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',  -- source text used for verbatim checks (capped)
  published_at  TEXT,
  fetched_at    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new',
  -- new | relevant | irrelevant | topic | checked | no_facts | no_source_text | failed
  sort_p        REAL,
  sort_model    TEXT,
  sorted_at     TEXT,
  checked_at    TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT
);
CREATE INDEX IF NOT EXISTS engine_items_status ON engine_items (status, fetched_at);

-- The fact sheet. Every number a post may use must come from a supported row here.
CREATE TABLE IF NOT EXISTS engine_facts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         INTEGER NOT NULL REFERENCES engine_items (id),
  number_text     TEXT NOT NULL,           -- the number as written in the source, with unit
  number_core     TEXT NOT NULL,           -- the digits as written, e.g. "1.2" or "43"
  value           REAL,                    -- parsed value, for arithmetic done by code
  unit            TEXT NOT NULL,           -- percent | USD | EUR | other currency code | count
  claim           TEXT NOT NULL,           -- the sentence from the source that holds the number
  source_url      TEXT NOT NULL,
  source_name     TEXT NOT NULL,
  source_date     TEXT NOT NULL,           -- YYYY-MM-DD
  lang            TEXT NOT NULL,
  status          TEXT NOT NULL,           -- supported | unsupported
  judge_p         REAL,                    -- Jev: probability that the source supports the claim
  judge_model     TEXT,
  reviewer_model  TEXT,                    -- set when Sonnet decided (judge_p < 0.90)
  reviewer_supported INTEGER,
  created_at      TEXT NOT NULL,
  UNIQUE (item_id, number_text, claim)
);
CREATE INDEX IF NOT EXISTS engine_facts_status ON engine_facts (status, source_date);

-- Every paid model call, for the monthly budget. No prompts, no outputs.
CREATE TABLE IF NOT EXISTS engine_llm_calls (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  at             TEXT NOT NULL,
  month          TEXT NOT NULL,            -- YYYY-MM (UTC)
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  purpose        TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd       REAL NOT NULL DEFAULT 0,
  ok             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS engine_llm_calls_month ON engine_llm_calls (month);

-- Watch state for fixed reports (new editions) and other sources.
CREATE TABLE IF NOT EXISTS engine_source_state (
  source_id     TEXT PRIMARY KEY,
  last_seen     TEXT,                      -- JSON list of known edition links
  last_checked  TEXT,
  last_error    TEXT
);
