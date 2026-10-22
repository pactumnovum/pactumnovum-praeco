import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR } from "../src/net.ts";
import { parseTrendingTopics } from "../src/sources/bluesky.ts";
import { bodyToRows, parseImfDataMapper, parseJsonStat, parseWorldBank, rowsToBody } from "../src/sources/datasets.ts";
import { findReportLinks } from "../src/sources/reports.ts";
import { parseFeed } from "../src/sources/rss.ts";

const fixture = (name: string) => readFileSync(`${FIXTURES_DIR}http/${name}`, "utf8");

describe("parseFeed", () => {
  it("reads RSS 2.0 with CDATA and dates", () => {
    const entries = parseFeed(fixture("feed-en.xml"));
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      title: "Richest 1% gained more than the bottom half in Indonesia and Brazil, study finds",
      link: "https://example.org/en/richest-one-percent-study?utm_source=rss",
      publishedAt: "2026-10-19T08:00:00.000Z",
    });
    expect(entries[0]?.summary).not.toContain("<p>");
  });

  it("reads content:encoded as the body", () => {
    const [entry] = parseFeed(fixture("feed-fr.xml"));
    expect(entry?.content).toContain("46,2 %");
    expect(entry?.summary).toBe("Une étude sur les inégalités de revenus en Afrique de l'Ouest.");
  });

  it("reads Atom", () => {
    const entries = parseFeed(fixture("feed-es.xml"));
    expect(entries.map((e) => e.link)).toEqual([
      "https://example.org/es/desigualdad-mexico-peru",
      "https://example.org/es/futbol-jornada",
    ]);
    expect(entries[0]?.content).toContain("57,1 %");
    expect(entries[1]?.content).toBe("El equipo local ganó 3 a 1.");
  });
});

describe("datasets", () => {
  it("reads World Bank values as written and skips empty ones", () => {
    const ds = parseWorldBank(JSON.parse(fixture("worldbank-gini.json")));
    expect(ds.updated).toBe("2026-10-08");
    expect(ds.rows).toHaveLength(7);
    expect(ds.rows).toContainEqual({ label: "Gini index", area: "South Africa", period: "2014", value: "63" });
  });

  it("reads JSON-stat from Eurostat", () => {
    const ds = parseJsonStat(JSON.parse(fixture("eurostat-gini.json")));
    expect(ds.rows.map((r) => [r.area, r.period, r.value])).toEqual([
      ["Portugal", "2025", "30.4"],
      ["Slovenia", "2025", "27.4"],
      ["Slovakia", "2025", "23.4"],
    ]);
  });

  it("reads the IMF DataMapper shape, latest year per area", () => {
    const ds = parseImfDataMapper({ values: { NGDPDPC: { KEN: { "2024": 2100.5, "2025": 2206.1 } } } }, "GDP per capita");
    expect(ds.rows).toEqual([{ label: "GDP per capita", area: "KEN", period: "2025", value: "2206.1" }]);
  });

  it("round-trips rows through the item body", () => {
    const rows = [{ label: "Gini index", area: "Kenya", period: "2021", value: "38.7" }];
    expect(bodyToRows(rowsToBody(rows))).toEqual(rows);
  });
});

describe("reports and topics", () => {
  it("finds edition links on a report page", () => {
    const links = findReportLinks(fixture("report-page.html"), "https://example.org/reports/wealth", "/wealth-report-\\d{4}\\.pdf$");
    expect(links.map((l) => l.url)).toEqual([
      "https://example.org/reports/files/wealth-report-2026.pdf",
      "https://example.org/reports/files/wealth-report-2025.pdf",
    ]);
  });

  it("reads Bluesky trending topics", () => {
    const topics = parseTrendingTopics(JSON.parse(fixture("bluesky-trending.json")));
    expect(topics.map((t) => t.topic)).toEqual(["Billionaire tax vote", "Football final"]);
  });
});
