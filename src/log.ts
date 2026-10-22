// Structured logging that never prints secrets.
// Every message and field is passed through redact() before it is written.

import { SECRET_NAMES } from "./config.ts";

type Fields = Record<string, unknown>;

let secrets: string[] = [];

/** Collects the values of all secret variables so they can be removed from any output. */
export function registerSecrets(env: Record<string, string | undefined> = process.env): void {
  secrets = SECRET_NAMES.map((name) => env[name]?.trim())
    .filter((v): v is string => typeof v === "string" && v.length >= 6)
    .sort((a, b) => b.length - a.length);
}

export function redact(text: string): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join("[redacted]");
  // Bearer tokens and common key shapes, in case one arrives from somewhere unexpected.
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [redacted]");
  out = out.replace(/\b(sk-(?:or|ant)-[A-Za-z0-9_-]{8,})/g, "[redacted]");
  return out;
}

/** Turns any thrown value into a short, safe message. Never includes response bodies. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return redact(msg).slice(0, 300);
}

let sink: (line: string) => void = (line) => console.log(line);

/** Tests replace the sink to inspect output. */
export function setLogSink(fn: (line: string) => void): void {
  sink = fn;
}

function write(level: "info" | "warn" | "error", msg: string, fields?: Fields): void {
  const entry = { t: new Date().toISOString(), level, msg, ...fields };
  sink(redact(JSON.stringify(entry)));
}

export const log = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
