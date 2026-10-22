import { describe, expect, it } from "vitest";
import { containsVerbatim, extractNumbers, parseCore, verifyPostNumbers } from "../src/facts/numbers.ts";

const pick = (text: string, lang: Parameters<typeof extractNumbers>[1]) =>
  extractNumbers(text, lang).map((m) => [m.text, m.value, m.unit]);

describe("extractNumbers", () => {
  it("reads English percent, currency, magnitude and years", () => {
    const ms = extractNumbers("The richest 1% hold 43% of wealth, worth US$1.2 trillion in 2024.", "en");
    expect(ms.map((m) => [m.text, m.value, m.unit, m.isYear])).toEqual([
      ["1%", 1, "percent", false],
      ["43%", 43, "percent", false],
      ["US$1.2 trillion", 1.2e12, "USD", false],
      ["2024", 2024, "count", true],
    ]);
  });

  it("reads decimal commas, long-scale words and connectors", () => {
    expect(pick("Los más ricos ganan 1,5 billones de dólares y el 57,1 % del ingreso.", "es")).toEqual([
      ["1,5 billones de dólares", 1.5e12, "USD"],
      ["57,1 %", 57.1, "percent"],
    ]);
    expect(pick("Ils détiennent 1 000 milliards d'euros, soit 2,5 %.", "fr")).toEqual([
      ["1 000 milliards d'euros", 1e12, "EUR"],
      ["2,5 %", 2.5, "percent"],
    ]);
    expect(pick("Ein Plus von 3,4 Mrd. € auf 12.500 Euro, also 64,3 Prozent.", "de")).toEqual([
      ["3,4 Mrd. €", 3.4e9, "EUR"],
      ["12.500 Euro", 12500, "EUR"],
      ["64,3 Prozent", 64.3, "percent"],
    ]);
    expect(pick("Chegou a US$ 3,2 bilhões e 5 mil milhões; 1.500 pessoas.", "pt")).toEqual([
      ["US$ 3,2 bilhões", 3.2e9, "USD"],
      ["5 mil milhões", 5e9, "count"],
      ["1.500", 1500, "count"],
    ]);
  });

  it("treats German Billion as 10^12 and English billion as 10^9", () => {
    expect(extractNumbers("2 Billionen Euro", "de")[0]?.value).toBe(2e12);
    expect(extractNumbers("2 billion euros", "en")[0]?.value).toBe(2e9);
  });

  it("only reads short magnitudes next to a currency", () => {
    expect(pick("$5bn and 3m people", "en")).toEqual([
      ["$5bn", 5e9, "USD"],
      ["3", 3, "count"],
    ]);
  });

  it("ignores numbers that are part of names", () => {
    expect(extractNumbers("COVID-19 and the G20 summit", "en")).toEqual([]);
  });

  it("marks significance", () => {
    const [small, big] = extractNumbers("3 people own 2,500 homes", "en");
    expect(small?.significant).toBe(false);
    expect(big?.significant).toBe(true);
  });
});

describe("parseCore", () => {
  it("uses the language's decimal mark only when ambiguous", () => {
    expect(parseCore("1,500", "en")).toBe(1500);
    expect(parseCore("1.500", "es")).toBe(1500);
    expect(parseCore("1,5", "en")).toBe(1.5);
    expect(parseCore("1.234,56", "de")).toBe(1234.56);
    expect(parseCore("1,234.56", "en")).toBe(1234.56);
    expect(parseCore("1 000", "fr")).toBe(1000);
  });
});

describe("containsVerbatim", () => {
  it("matches whole numbers only", () => {
    expect(containsVerbatim("rose 1.5 points", "1.5")).toBe(true);
    expect(containsVerbatim("rose 11.52 points", "1.5")).toBe(false);
    expect(containsVerbatim("rose 1.50 points", "1.5")).toBe(false);
    expect(containsVerbatim("was 21.5%", "1.5")).toBe(false);
  });

  it("treats non-breaking and thin spaces as spaces", () => {
    expect(containsVerbatim("1 000 milliards", "1 000")).toBe(true);
    expect(containsVerbatim("1 000", "1 000")).toBe(true);
  });
});

describe("verifyPostNumbers", () => {
  const facts = [
    { id: 1, number_core: "31.4", value: 31.4, unit: "percent", claim: "The richest 1% held 31.4% of wealth in 2025.", source_date: "2026-10-19" },
    { id: 2, number_core: "214", value: 214e9, unit: "USD", claim: "Fortunes reached US$214 billion.", source_date: "2026-10-19" },
  ];

  it("passes a post whose numbers all come from the fact sheet", () => {
    const r = verifyPostNumbers("In 2025 the richest held 31.4% of wealth: $214 billion.", "en", facts);
    expect(r).toEqual({ ok: true, problems: [], usedFacts: [1, 2] });
  });

  it("accepts the same value written in another language", () => {
    expect(verifyPostNumbers("Los más ricos tienen el 31,4 % de la riqueza.", "es", facts).ok).toBe(true);
  });

  it("drops a post with an invented number", () => {
    const r = verifyPostNumbers("The richest held 35% of wealth.", "en", facts);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain("35%");
  });

  it("drops a post with the right digits but the wrong unit or magnitude", () => {
    expect(verifyPostNumbers("They hold $31.4.", "en", facts).ok).toBe(false);
    expect(verifyPostNumbers("Fortunes reached $214 million.", "en", facts).ok).toBe(false);
  });

  it("accepts values computed by code", () => {
    expect(verifyPostNumbers("That is 6,815 times more.", "en", facts, [6815]).ok).toBe(true);
  });

  it("drops a year that no used fact supports", () => {
    expect(verifyPostNumbers("In 2019 the richest held 31.4%.", "en", facts).ok).toBe(false);
  });
});
