import { describe, expect, it } from "vitest";
import { contentHash, htmlToText, normalizeUrl, splitSentences } from "../src/text.ts";

describe("normalizeUrl", () => {
  it("removes tracking parameters, fragments, www and trailing slashes", () => {
    const a = normalizeUrl("https://www.Example.org/en/story/?utm_source=rss&utm_medium=x#comments");
    const b = normalizeUrl("https://example.org/en/story");
    expect(a).toBe(b);
    expect(normalizeUrl("https://example.org/a?b=2&a=1")).toBe("https://example.org/a?a=1&b=2");
  });
});

describe("contentHash", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(contentHash("Richest 1%  gain", "Text, here.")).toBe(contentHash("richest 1% gain", "text here"));
    expect(contentHash("Richest 1% gain", "a")).not.toBe(contentHash("Richest 2% gain", "a"));
  });
});

describe("htmlToText", () => {
  it("drops head, scripts and navigation and decodes entities", () => {
    const html =
      "<html><head><title>T</title></head><body><nav>Menu</nav><script>x=1</script><p>A &amp; B&#8217;s 5&nbsp;%</p></body></html>";
    expect(htmlToText(html)).toBe("A & B’s 5 %");
  });
});

describe("splitSentences", () => {
  it("does not split on decimal points or short abbreviations", () => {
    expect(splitSentences("It rose 1.5 points. Dr. Silva said so. Next one!")).toEqual([
      "It rose 1.5 points.",
      "Dr. Silva said so.",
      "Next one!",
    ]);
  });
});
