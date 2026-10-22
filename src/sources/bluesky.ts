export interface Topic {
  topic: string;
  displayName: string;
  description: string;
  link: string;
}

/** app.bsky.unspecced.getTrendingTopics on Bluesky's public, unauthenticated API. */
export function parseTrendingTopics(json: unknown): Topic[] {
  const topics = (json as { topics?: Partial<Topic>[] }).topics ?? [];
  return topics
    .filter((t) => typeof t.topic === "string" && t.topic.length > 0)
    .map((t) => ({
      topic: t.topic!,
      displayName: t.displayName ?? t.topic!,
      description: t.description ?? "",
      link: t.link ?? "",
    }));
}
