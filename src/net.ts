// Read-only access to public web pages and open APIs.
// Live runs use the network. Dry runs and tests read the same URLs from fixtures/.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Page {
  url: string;
  status: number;
  contentType: string;
  text: string;
}

export interface Fetcher {
  get(url: string, opts?: { accept?: string }): Promise<Page>;
}

const USER_AGENT = "praeco/0.1 (+https://pactumnovum.org)";
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 20_000;

/** Fetches public pages only. No cookies, no logins, no credentials of any kind. */
export function httpFetcher(fetchImpl: typeof fetch = fetch): Fetcher {
  return {
    async get(url, opts = {}) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`unsupported protocol: ${parsed.protocol}`);
      }
      const res = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: opts.accept ?? "*/*" },
        redirect: "follow",
        credentials: "omit",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const contentType = res.headers.get("content-type") ?? "";
      const text = await readCapped(res);
      return { url: res.url || url, status: res.status, contentType, text };
    },
  };
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

export const FIXTURES_DIR = fileURLToPath(new URL("../fixtures/", import.meta.url));

interface FixtureEntry {
  file: string;
  contentType: string;
  status?: number;
}

/**
 * Serves URLs from fixtures/http/index.json. Any URL without a fixture fails, so a
 * dry run can never reach the network by accident.
 */
export function fixtureFetcher(dir: string = FIXTURES_DIR): Fetcher {
  const index = JSON.parse(readFileSync(join(dir, "http", "index.json"), "utf8")) as Record<string, FixtureEntry>;
  return {
    async get(url) {
      const entry = index[url];
      if (!entry) return { url, status: 404, contentType: "text/plain", text: "" };
      return {
        url,
        status: entry.status ?? 200,
        contentType: entry.contentType,
        text: readFileSync(join(dir, "http", entry.file), "utf8"),
      };
    },
  };
}
