// Every link the engine publishes points to the site with a `via` tag, so the site
// can count visits and signatures per channel (CLAUDE.md, section 7).

export const VIA = [
  "bluesky", "x", "tiktok", "instagram", "youtube", "poster", "share", "press", "newsletter", "radar", "direct",
] as const;

export type Via = (typeof VIA)[number];

export const SITE = "https://pactumnovum.org/";

export function trackedLink(via: Via): string {
  if (!VIA.includes(via)) throw new Error(`unknown via: ${via}`);
  return `${SITE}?via=${via}`;
}

/** The longest link the engine can produce, for length checks. */
export const LONGEST_LINK = VIA.map((v) => trackedLink(v)).reduce((a, b) => (b.length > a.length ? b : a));
