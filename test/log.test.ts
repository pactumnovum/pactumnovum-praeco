import { afterEach, describe, expect, it } from "vitest";
import { errorMessage, log, redact, registerSecrets, setLogSink } from "../src/log.ts";

afterEach(() => {
  registerSecrets({});
  setLogSink((line) => console.log(line));
});

describe("log", () => {
  it("never prints secret values", () => {
    registerSecrets({ OPENROUTER_API_KEY: "fake-secret-value-123", D1_DATABASE_ID: "fake-database-id-456" });
    const lines: string[] = [];
    setLogSink((l) => lines.push(l));
    log.error("failed", { error: "request with fake-secret-value-123 to db fake-database-id-456" });
    expect(lines.join("\n")).not.toContain("fake-secret-value-123");
    expect(lines.join("\n")).not.toContain("fake-database-id-456");
    expect(lines.join("\n")).toContain("[redacted]");
  });

  it("redacts bearer tokens and key shapes even when not registered", () => {
    expect(redact("Authorization: Bearer abcdefghijklmnop")).toBe("Authorization: Bearer [redacted]");
    expect(redact("key sk-or-v1-abcdefghijkl")).toBe("key [redacted]");
  });

  it("shortens error messages", () => {
    expect(errorMessage(new Error("x".repeat(1000))).length).toBe(300);
  });
});
