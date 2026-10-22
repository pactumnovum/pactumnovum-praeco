import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openLocalDb } from "../src/db/local.ts";
import { readSignatureAggregates, signaturesPerDay } from "../src/signatures.ts";

function websiteDb(withSource: boolean): string {
  const path = join(mkdtempSync(join(tmpdir(), "praeco-")), "site.sqlite");
  // Built directly, outside the engine, the way the website creates it.
  const raw = new DatabaseSync(path);
  raw.exec(
    `CREATE TABLE signatures (id INTEGER PRIMARY KEY, first_name TEXT, country TEXT, day TEXT, token_hash TEXT${withSource ? ", source TEXT" : ""})`,
  );
  const rows = [
    ["Ana", "PE", "2026-10-20", "h1", "web"],
    ["Kofi", "GH", "2026-10-21", "h2", "web"],
    ["Mei", "VN", "2026-10-21", "h3", "qr"],
  ];
  for (const r of rows) {
    if (withSource) raw.prepare("INSERT INTO signatures (first_name, country, day, token_hash, source) VALUES (?, ?, ?, ?, ?)").run(...r);
    else raw.prepare("INSERT INTO signatures (first_name, country, day, token_hash) VALUES (?, ?, ?, ?)").run(...r.slice(0, 4));
  }
  raw.close();
  return path;
}

describe("signature aggregates", () => {
  it("reads totals only", async () => {
    const db = openLocalDb(websiteDb(true));
    const agg = await readSignatureAggregates(db);
    expect(agg.total).toBe(3);
    expect(agg.perCountry).toHaveLength(3);
    expect(agg.perSource).toEqual([
      { source: "web", n: 2 },
      { source: "qr", n: 1 },
    ]);
    expect(JSON.stringify(agg)).not.toMatch(/Ana|Kofi|Mei|h1/);
    expect(await signaturesPerDay(db, "2026-10-21")).toEqual([{ day: "2026-10-21", n: 2 }]);
  });

  it("works when the website has no source column", async () => {
    const agg = await readSignatureAggregates(openLocalDb(websiteDb(false)));
    expect(agg.perSource).toBeNull();
  });

  it("refuses row-level reads and writes", async () => {
    const db = openLocalDb(websiteDb(true));
    await expect(db.all("SELECT first_name FROM signatures")).rejects.toThrow(/guard/);
    await expect(db.run("DELETE FROM signatures")).rejects.toThrow(/guard/);
  });
});
