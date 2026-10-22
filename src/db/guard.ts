// Every SQL statement passes through this guard before it reaches a database.
//
// Rules (CLAUDE.md, sections 1 and 7):
// - The engine only touches tables whose names start with "engine_".
// - The one exception is reading aggregates from "signatures", and only through
//   the exact queries listed below. No first names, no row-level data, no writes.

/** The only statements that may mention the signatures table. */
export const SIGNATURE_QUERIES = {
  total: "SELECT COUNT(*) AS n FROM signatures",
  perCountry: "SELECT country, COUNT(*) AS n FROM signatures GROUP BY country ORDER BY n DESC, country ASC",
  perDay: "SELECT day, COUNT(*) AS n FROM signatures WHERE day >= ?1 GROUP BY day ORDER BY day ASC",
  columns: "SELECT name FROM pragma_table_info('signatures')",
  perSource: "SELECT source, COUNT(*) AS n FROM signatures GROUP BY source ORDER BY n DESC, source ASC",
} as const;

const ALLOWED_SIGNATURE_SQL = new Set(Object.values(SIGNATURE_QUERIES).map(normalize));

export class SqlGuardError extends Error {
  constructor(reason: string) {
    super(`SQL refused by guard: ${reason}`);
    this.name = "SqlGuardError";
  }
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().replace(/;$/, "").toLowerCase();
}

function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

/** Table names that follow FROM, JOIN, INTO, UPDATE, TABLE, or ON in CREATE INDEX. */
function referencedTables(sql: string): string[] {
  const names: string[] = [];
  // "ON CONFLICT (...) DO UPDATE SET" is an upsert clause, not a table reference.
  const text = sql.replace(/\bdo\s+update\s+set\b/gi, " ");
  const patterns = [
    /\b(?:from|join|into|update|table(?:\s+if\s+(?:not\s+)?exists)?)\s+["`[]?([a-z_][a-z0-9_]*)/gi,
    /\bindex\s+(?:if\s+not\s+exists\s+)?[a-z_][a-z0-9_]*\s+on\s+["`[]?([a-z_][a-z0-9_]*)/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const name = m[1];
      if (name) names.push(name.toLowerCase());
    }
  }
  return names;
}

export function guardSql(sql: string): void {
  const normalized = normalize(sql);
  const bare = normalize(stripCommentsAndStrings(sql));

  if (/\bsignatures\b/.test(normalize(sql.replace(/\bengine_[a-z0-9_]*/gi, "")))) {
    if (!ALLOWED_SIGNATURE_SQL.has(normalized)) {
      throw new SqlGuardError("the signatures table may only be read through the approved aggregate queries");
    }
    return;
  }

  if (/\b(attach|detach|vacuum|pragma)\b/.test(bare)) {
    throw new SqlGuardError("database-level statements are not allowed");
  }
  if (/\bcreate\s+(?:temp\w*\s+)?(trigger|view)\b/.test(bare)) {
    throw new SqlGuardError("triggers and views are not allowed");
  }

  for (const table of referencedTables(bare)) {
    if (!table.startsWith("engine_")) {
      throw new SqlGuardError(`table "${table}" does not start with engine_`);
    }
  }
}
