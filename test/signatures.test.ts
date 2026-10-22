import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openLocalDb } from "../src/db/local.ts";
import { readSignatureAggregates, signaturesPerDay } from "../src/signatures.ts";

function websiteDb(withVia: boolean): string {
  const path = join(mkdtempSync(join(tmpdir(), "praeco-")), "site.sqlite");
  // Built directly, outside the engine, the way the website creates it.
  const raw = new DatabaseSync(path);
  raw.exec(
    `CREATE TABLE signatures (id INTEGER PRIMARY KEY, first_name TEXT, country TEXT, day TEXT, token_hash TEXT${withVia ? ", via TEXT" : ""})`,
  );
  const rows = [
    ["Ana", "PE", "2026-10-20", "h1", "bluesky"],
    ["Kofi", "GH", "2026-10-21", "h2", "bluesky"],
    ["Mei", "VN", "2026-10-21", "h3", "poster"],
  ];
  for (const r of rows) {
    if (withVia) raw.prepare("INSERT INTO signatures (first_name, country, day, token_hash, via) VALUES (?, ?, ?, ?, ?)").run(...r);
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
    expect(agg.perVia).toEqual([
      { via: "bluesky", n: 2 },
      { via: "poster", n: 1 },
    ]);
    expect(JSON.stringify(agg)).not.toMatch(/Ana|Kofi|Mei|h1/);
    expect(await signaturesPerDay(db, "2026-10-21")).toEqual([{ day: "2026-10-21", n: 2 }]);
  });

  it("works when the website has no via column", async () => {
    const agg = await readSignatureAggregates(openLocalDb(websiteDb(false)));
    expect(agg.perVia).toBeNull();
  });

  it("refuses row-level reads and writes", async () => {
    const db = openLocalDb(websiteDb(true));
    await expect(db.all("SELECT first_name FROM signatures")).rejects.toThrow(/guard/);
    await expect(db.run("DELETE FROM signatures")).rejects.toThrow(/guard/);
  });
});
