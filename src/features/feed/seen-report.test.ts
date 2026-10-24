import { describe, expect, it } from "vitest";

import {
  decodeRingCursor,
  encodeRingCursor,
  startRingCursor
} from "./ring-feed";
import { countSeen, hasSeen, markSeen } from "./seen-bits";
import {
  MAX_SEEN_IDS,
  SEEN_BODY_LIMIT,
  applySeenReport,
  freshBase,
  parseSeenReport,
  type SeenBase
} from "./seen-report";
import { parsePositions } from "./viewer-positions";

const NOW = 5_000;
const cursor = startRingCursor({
  topic: "science",
  mood: "all",
  origin: 1234,
  freshAt: 900
});
const encoded = encodeRingCursor(cursor);

function base(seqs: number[] = [], freshAt = 1_000): SeenBase {
  const marked = markSeen(new Uint8Array(0), seqs);

  return {
    seen: marked.bits,
    seenCount: marked.added,
    positions: new Map(),
    freshAt
  };
}

describe("parseSeenReport", () => {
  it("nhận ids hợp lệ, bỏ id trùng, cursor tùy chọn", () => {
    expect(parseSeenReport({ ids: ["a", "b", "a"] })).toEqual({
      ids: ["a", "b"],
      cursor: null
    });
    expect(parseSeenReport({ ids: ["a"], cursor: null })?.cursor).toBeNull();
    expect(parseSeenReport({ ids: ["a"], cursor: encoded })?.cursor).toEqual(
      decodeRingCursor(encoded)
    );
  });

  it("từ chối body sai", () => {
    const bad: unknown[] = [
      undefined,
      null,
      "ids",
      [],
      {},
      { ids: [] },
      { ids: "a" },
      { ids: [1] },
      { ids: ["a b"] },
      { ids: ["x".repeat(81)] },
      { ids: Array.from({ length: MAX_SEEN_IDS + 1 }, (_, i) => `p${i}`) },
      { ids: ["a"], cursor: 5 },
      { ids: ["a"], cursor: "v5:abc" },
      { ids: ["a"], cursor: "v6:broken" }
    ];

    for (const body of bad) expect(parseSeenReport(body)).toBeNull();
  });

  it("đúng MAX_SEEN_IDS id dài nhất + cursor vẫn nằm trong SEEN_BODY_LIMIT", () => {
    const ids = Array.from(
      { length: MAX_SEEN_IDS },
      (_, i) => `${i}`.padStart(80, "x")
    );
    const id = "y".repeat(80);
    const mark = { mode: "after", wrapped: true, rankKey: 2147483646, id } as const;
    const longest = encodeRingCursor({
      ...startRingCursor({
        topic: "psychology",
        mood: "stressed",
        origin: 2147483647,
        freshAt: 2147483647
      }),
      emitted: 999_999_999,
      lastTheme: "psychology",
      lastKind: "psychology",
      preferred: mark,
      related: mark,
      surprise: mark,
      fresh: { mode: "after", publishedAt: 2147483647, id }
    });
    const body = JSON.stringify({ ids, cursor: longest });

    expect(decodeRingCursor(longest)).not.toBeNull();
    expect(longest.length).toBeGreaterThan(400);
    expect(body.length).toBeLessThanOrEqual(SEEN_BODY_LIMIT);
    expect(parseSeenReport(JSON.parse(body))?.ids).toHaveLength(MAX_SEEN_IDS);
  });
});

describe("applySeenReport", () => {
  it("đánh dấu bài mới xem, cộng seen_count", () => {
    const write = applySeenReport(
      base([1]),
      [
        { seq: 1, publishedAt: 10 },
        { seq: 7, publishedAt: 20 },
        { seq: 300, publishedAt: 30 }
      ],
      null,
      NOW
    );

    expect(write?.added).toBe(2);
    expect(write?.seenCount).toBe(3);
    expect(countSeen(write?.seen ?? new Uint8Array(0))).toBe(3);
    expect(hasSeen(write?.seen ?? new Uint8Array(0), 300)).toBe(true);
    expect(write?.freshAt).toBe(1_000);
  });

  it("không có gì mới: null (khỏi ghi D1)", () => {
    expect(applySeenReport(base([1, 2]), [{ seq: 2, publishedAt: 5 }], null, NOW)).toBeNull();
    expect(applySeenReport(base(), [], null, NOW)).toBeNull();
  });

  it("cùng vị trí đã lưu: không tính là thay đổi", () => {
    const start = base([1]);
    const first = applySeenReport(start, [], cursor, NOW);

    expect(first).not.toBeNull();

    const again = applySeenReport(
      { ...start, positions: parsePositions(first?.positionsJson ?? "{}") },
      [{ seq: 1, publishedAt: 5 }],
      cursor,
      NOW
    );

    expect(again).toBeNull();
  });

  it("lưu vị trí theo bộ lọc của cursor", () => {
    const write = applySeenReport(base(), [{ seq: 3, publishedAt: 5 }], cursor, NOW);
    const positions = parsePositions(write?.positionsJson ?? "{}");

    expect([...positions.keys()]).toEqual(["science:all"]);
    expect(positions.get("science:all")).toBe(encoded);
  });

  it("mốc bài mới chỉ tiến, không vượt hiện tại", () => {
    const forward = applySeenReport(
      base([], 1_000),
      [
        { seq: 1, publishedAt: 1_500 },
        { seq: 2, publishedAt: 1_200 },
        { seq: 3, publishedAt: 400 }
      ],
      null,
      NOW
    );

    expect(forward?.freshAt).toBe(1_500);

    const future = applySeenReport(base([], 1_000), [{ seq: 4, publishedAt: NOW + 99 }], null, NOW);
    expect(future?.freshAt).toBe(NOW);

    const old = applySeenReport(base([], 1_000), [{ seq: 5, publishedAt: 10 }], null, NOW);
    expect(old?.freshAt).toBe(1_000);
  });

  it("chỉ mốc bài mới đổi vẫn là thay đổi", () => {
    const write = applySeenReport(base([9], 1_000), [{ seq: 9, publishedAt: 2_000 }], null, NOW);

    expect(write?.added).toBe(0);
    expect(write?.freshAt).toBe(2_000);
  });

  it("người mới: bắt đầu từ bài đã thích/lưu và mốc = hiện tại", () => {
    const kept = markSeen(new Uint8Array(0), [4, 5]);
    const start = freshBase(kept.bits, kept.added, NOW);
    const write = applySeenReport(start, [{ seq: 4, publishedAt: 10 }, { seq: 8, publishedAt: 10 }], null, NOW);

    expect(start.freshAt).toBe(NOW);
    expect(write?.added).toBe(1);
    expect(write?.seenCount).toBe(3);
    expect([4, 5, 8].every((seq) => hasSeen(write?.seen ?? new Uint8Array(0), seq))).toBe(true);
  });

  it("không sửa trạng thái gốc", () => {
    const start = base([1]);
    const before = [...start.seen];

    applySeenReport(start, [{ seq: 50, publishedAt: 5 }], cursor, NOW);

    expect([...start.seen]).toEqual(before);
    expect(start.positions.size).toBe(0);
  });
});
