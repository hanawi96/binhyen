import { describe, expect, it } from "vitest";

import { mergeViewerStates } from "./merge-viewer-state";
import { countSeen, hasSeen, markSeen } from "./seen-bits";
import { mergePositions, parsePositions } from "./viewer-positions";

describe("mergePositions", () => {
  it("tài khoản làm nền, ẩn danh đè lên khi trùng bộ lọc", () => {
    const into = new Map([
      ["all:all", "v6:account"],
      ["science:all", "v6:old-science"]
    ]);
    const from = new Map([
      ["science:all", "v6:device"],
      ["nature:calm", "v6:nature"]
    ]);

    expect([...mergePositions(into, from).entries()]).toEqual([
      ["all:all", "v6:account"],
      ["science:all", "v6:device"],
      ["nature:calm", "v6:nature"]
    ]);
  });
});

describe("mergeViewerStates", () => {
  it("chưa có tài khoản: giữ nguyên lịch sử ẩn danh", () => {
    const seen = markSeen(new Uint8Array(0), [1, 2]).bits;
    const merged = mergeViewerStates(null, {
      seen,
      seenCount: 2,
      positions: new Map([["all:all", "v6:a"]]),
      freshAt: 100,
      loopCount: 1
    });

    expect(merged.seenCount).toBe(2);
    expect(merged.freshAt).toBe(100);
    expect(merged.loopCount).toBe(1);
    expect(parsePositions(merged.positionsJson).get("all:all")).toBe("v6:a");
  });

  it("OR bitmap, lấy mốc / vòng lớn hơn, gộp vị trí", () => {
    const into = {
      seen: markSeen(new Uint8Array(0), [1, 2]).bits,
      seenCount: 2,
      positions: new Map([["all:all", "v6:u"]]),
      freshAt: 500,
      loopCount: 0
    };
    const from = {
      seen: markSeen(new Uint8Array(0), [2, 40]).bits,
      seenCount: 2,
      positions: new Map([["science:all", "v6:a"]]),
      freshAt: 900,
      loopCount: 2
    };
    const merged = mergeViewerStates(into, from);

    expect(merged.seenCount).toBe(3);
    expect(countSeen(merged.seen)).toBe(3);
    expect(hasSeen(merged.seen, 1)).toBe(true);
    expect(hasSeen(merged.seen, 40)).toBe(true);
    expect(merged.freshAt).toBe(900);
    expect(merged.loopCount).toBe(2);
    expect([...parsePositions(merged.positionsJson).keys()]).toEqual([
      "all:all",
      "science:all"
    ]);
  });

  it("không sửa bản gốc", () => {
    const intoSeen = markSeen(new Uint8Array(0), [1]).bits;
    const fromSeen = markSeen(new Uint8Array(0), [2]).bits;
    const into = {
      seen: intoSeen,
      seenCount: 1,
      positions: new Map([["all:all", "v6:u"]]),
      freshAt: 1,
      loopCount: 0
    };

    mergeViewerStates(into, {
      seen: fromSeen,
      seenCount: 1,
      positions: new Map([["all:all", "v6:a"]]),
      freshAt: 2,
      loopCount: 1
    });

    expect([...into.seen]).toEqual([...intoSeen]);
    expect(into.positions.get("all:all")).toBe("v6:u");
  });
});
