import { describe, expect, it } from "vitest";

import {
  decodeFeedCursor,
  encodeFeedCursor,
  isAfterFeedCursor,
  type FeedCursorKey
} from "./feed-cursor";

function key(
  publishedAt: number,
  id: string,
  topic: FeedCursorKey["topic"] = "all",
  mood: FeedCursorKey["mood"] = "all"
): FeedCursorKey {
  return { publishedAt, id, topic, mood };
}

function byFeedOrder(a: FeedCursorKey, b: FeedCursorKey): number {
  if (a.publishedAt !== b.publishedAt) {
    return b.publishedAt - a.publishedAt;
  }

  if (a.id === b.id) return 0;

  return a.id < b.id ? 1 : -1;
}

function pageAfter(
  rows: readonly FeedCursorKey[],
  cursor: FeedCursorKey | null,
  limit: number
): FeedCursorKey[] {
  return rows
    .filter((row) =>
      cursor === null || isAfterFeedCursor(row, cursor)
    )
    .sort(byFeedOrder)
    .slice(0, limit);
}

describe("Feed cursor", () => {
  it("round-trips a publish key", () => {
    const cursorKey = key(
      1_700_000_000,
      "story:10/a b",
      "science",
      "curious"
    );

    const encoded = encodeFeedCursor(cursorKey);

    expect(encoded.startsWith("v3:")).toBe(true);
    expect(decodeFeedCursor(encoded)).toEqual(cursorKey);
  });

  it("rejects cursors that are not a v3 filtered key", () => {
    expect(decodeFeedCursor("")).toBeNull();
    expect(decodeFeedCursor("v1:10:abc")).toBeNull();
    expect(decodeFeedCursor("v2:10:abc")).toBeNull();
    expect(decodeFeedCursor("v3:10:abc")).toBeNull();
    expect(decodeFeedCursor("v3:-1:abc:all:all")).toBeNull();
    expect(decodeFeedCursor("v3:10:%:all:all")).toBeNull();
    expect(decodeFeedCursor("v3:10:abc:unknown:all")).toBeNull();
    expect(decodeFeedCursor("v3:10:abc:peace:unknown")).toBeNull();
    expect(
      decodeFeedCursor(`v3:10:${"a".repeat(300)}:all:all`)
    ).toBeNull();
  });

  it("walks every row once when timestamps tie", () => {
    const rows: FeedCursorKey[] = [
      key(200, "2"),
      key(200, "10"),
      key(200, "1"),
      key(100, "9"),
      key(300, "a")
    ];

    const seen: string[] = [];
    let cursor: FeedCursorKey | null = null;

    for (let step = 0; step < 10; step++) {
      const page = pageAfter(rows, cursor, 2);

      if (page.length === 0) break;

      seen.push(...page.map((row) => row.id));
      cursor = page.at(-1) ?? null;
    }

    expect(seen).toEqual(["a", "2", "10", "1", "9"]);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it("places a tied row only after the cursor id", () => {
    const cursor = key(200, "10", "peace", "calm");

    expect(
      isAfterFeedCursor(key(200, "2"), cursor)
    ).toBe(false);

    expect(
      isAfterFeedCursor(key(200, "1"), cursor)
    ).toBe(true);

    expect(
      isAfterFeedCursor(key(199, "z"), cursor)
    ).toBe(true);
  });
});
