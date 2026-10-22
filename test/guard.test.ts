import { describe, expect, it } from "vitest";
import { SIGNATURE_QUERIES, guardSql } from "../src/db/guard.ts";

describe("guardSql", () => {
  it("allows engine tables", () => {
    expect(() => guardSql("SELECT * FROM engine_items WHERE status = 'new'")).not.toThrow();
    expect(() => guardSql("CREATE TABLE IF NOT EXISTS engine_x (id INTEGER)")).not.toThrow();
    expect(() => guardSql("CREATE INDEX IF NOT EXISTS engine_x_i ON engine_x (id)")).not.toThrow();
    expect(() =>
      guardSql(
        "INSERT INTO engine_source_state (source_id) VALUES (?1) ON CONFLICT (source_id) DO UPDATE SET last_error = NULL",
      ),
    ).not.toThrow();
    expect(() => guardSql("SELECT a.id FROM engine_items a JOIN engine_facts f ON f.item_id = a.id")).not.toThrow();
  });

  it("allows only the approved aggregate queries on signatures", () => {
    for (const q of Object.values(SIGNATURE_QUERIES)) expect(() => guardSql(q)).not.toThrow();
    expect(() => guardSql("SELECT first_name FROM signatures")).toThrow(/signatures/);
    expect(() => guardSql("SELECT * FROM signatures")).toThrow(/signatures/);
    expect(() => guardSql("SELECT country, COUNT(*) AS n FROM signatures GROUP BY country")).toThrow();
    expect(() => guardSql("INSERT INTO signatures (first_name) VALUES ('x')")).toThrow();
    expect(() => guardSql("DELETE FROM signatures")).toThrow();
    expect(() => guardSql("SELECT * FROM engine_items JOIN signatures ON 1 = 1")).toThrow();
  });

  it("refuses other tables and database-level statements", () => {
    expect(() => guardSql("SELECT * FROM users")).toThrow(/engine_/);
    expect(() => guardSql("DROP TABLE accounts")).toThrow(/engine_/);
    expect(() => guardSql("UPDATE other SET x = 1")).toThrow(/engine_/);
    expect(() => guardSql("PRAGMA table_info(engine_items)")).toThrow();
    expect(() => guardSql("ATTACH DATABASE 'x' AS y")).toThrow();
    expect(() => guardSql("CREATE TRIGGER engine_t AFTER INSERT ON engine_items BEGIN SELECT 1; END")).toThrow();
  });

  it("is not fooled by comments or quoted text", () => {
    expect(() => guardSql("SELECT * FROM /* engine_ */ users")).toThrow();
    expect(() => guardSql("SELECT 'FROM users' AS x FROM engine_items")).not.toThrow();
  });
});
