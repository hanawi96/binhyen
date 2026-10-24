import { describe, expect, it } from "vitest";

import { isAfterFeedCursor } from "./feed-cursor";
import {
  assembleRankedPage,
  decodeRankCursor,
  encodeRankCursor,
  hasDirectMatch,
  startRankCursor,
  type RankCursor,
  type RankStream,
  type Rankable,
  type StreamMark
} from "./rank-feed";

interface Card extends Rankable {
  label: string;
}

function card(
  id: string,
  publishedAt: number,
  theme: string,
  kind: string
): Card {
  return { id, publishedAt, theme, kind, label: id };
}

function sliceStream(
  rows: readonly Card[],
  mark: StreamMark,
  limit: number
): RankStream<Card> {
  if (mark.mode === "done") {
    return { items: [], complete: true };
  }

  const available =
    mark.mode === "start"
      ? rows
      : rows.filter((row) =>
          isAfterFeedCursor(
            {
              publishedAt: row.publishedAt,
              id: row.id,
              topic: "all",
              mood: "all"
            },
            {
              publishedAt: mark.publishedAt,
              id: mark.id,
              topic: "all",
              mood: "all"
            }
          )
        );

  return {
    items: available.slice(0, limit + 1),
    complete: available.length <= limit
  };
}

function readAll(
  streams: Record<"preferred" | "related" | "surprise", Card[]>,
  limit: number
): string[] {
  let cursor: RankCursor = startRankCursor("peace", "tired");
  const seen: string[] = [];

  for (let step = 0; step < 20; step++) {
    const page = assembleRankedPage(
      {
        preferred: sliceStream(
          streams.preferred,
          cursor.preferred,
          limit
        ),
        related: sliceStream(
          streams.related,
          cursor.related,
          limit
        ),
        surprise: sliceStream(
          streams.surprise,
          cursor.surprise,
          limit
        )
      },
      cursor,
      limit
    );

    seen.push(...page.items.map((item) => item.id));

    if (!page.hasMore) break;

    cursor = page.cursor;
  }

  return seen;
}

describe("Ranked feed pages", () => {
  const preferred = [
    card("5", 300, "psychology", "psychology"),
    card("3", 300, "story", "insight"),
    card("1", 300, "peace", "quote")
  ];
  const related = [
    card("4", 300, "nature", "fact")
  ];
  const surprise = [
    card("6", 300, "cute", "cute"),
    card("2", 300, "discovery", "fact")
  ];

  it("keeps every id once across pages", () => {
    const seen = readAll(
      { preferred, related, surprise },
      2
    );

    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
    expect(seen.slice().sort()).toEqual(
      ["1", "2", "3", "4", "5", "6"]
    );
  });

  it("does not drop a preferred card when it breaks up a repeat", () => {
    const seen = readAll(
      {
        preferred: [
          card("a", 200, "peace", "quote"),
          card("b", 100, "peace", "quote")
        ],
        related: [],
        surprise: [
          card("c", 150, "nature", "fact")
        ]
      },
      2
    );

    expect(seen).toContain("a");
    expect(seen).toContain("b");
    expect(seen).toContain("c");
    expect(seen[0]).toBe("a");
    expect(seen[1]).not.toBe("b");
  });

  it("uses other groups when the preferred group is empty", () => {
    const seen = readAll(
      {
        preferred: [],
        related: [card("r", 50, "story", "story")],
        surprise: [card("s", 40, "cute", "cute")]
      },
      3
    );

    expect(seen).toEqual(["r", "s"]);
  });

  it("round-trips the rank cursor", () => {
    const cursor = startRankCursor("science", "curious");
    const page = assembleRankedPage(
      {
        preferred: {
          items: [card("4", 20, "nature", "fact")],
          complete: true
        },
        related: { items: [], complete: true },
        surprise: {
          items: [card("6", 30, "cute", "cute")],
          complete: true
        }
      },
      cursor,
      2
    );

    const encoded = encodeRankCursor(page.cursor);

    expect(encoded.startsWith("v5:science:curious:-:")).toBe(true);
    expect(decodeRankCursor(encoded)).toEqual(page.cursor);
    expect(decodeRankCursor("v3:20:4:science:curious")).toBeNull();
  });

  it("keeps favorite topics only when nothing is filtered", () => {
    const personal = startRankCursor("all", "all", [
      "nature",
      "peace",
      "nature"
    ]);
    const encoded = encodeRankCursor(personal);

    expect(personal.favorites).toEqual(["nature", "peace"]);
    expect(encoded.startsWith("v5:all:all:nature.peace:0:")).toBe(true);
    expect(decodeRankCursor(encoded)).toEqual(personal);
    expect(startRankCursor("science", "all", ["peace"]).favorites).toEqual(
      []
    );
    expect(startRankCursor("all", "sad", ["peace"]).favorites).toEqual([]);
  });

  it("rejects favorite topics that do not fit the cursor", () => {
    const tail = ":0:-:-:-:-:-:-:-:-";

    expect(decodeRankCursor(`v5:all:all:peace.nature${tail}`)).toBeNull();
    expect(decodeRankCursor(`v5:all:all:peace.unknown${tail}`)).toBeNull();
    expect(decodeRankCursor(`v5:science:all:peace${tail}`)).toBeNull();
    expect(decodeRankCursor(`v5:all:all:nature.peace${tail}`)).not.toBeNull();
  });

  it("says a filter has no post of its own only when preferred is empty", () => {
    const cursor = startRankCursor("tips", "all");

    expect(hasDirectMatch(cursor.preferred, 0)).toBe(false);
    expect(hasDirectMatch(cursor.preferred, 2)).toBe(true);
    expect(
      hasDirectMatch(
        { mode: "after", publishedAt: 1, id: "4" },
        0
      )
    ).toBe(true);
  });
});
