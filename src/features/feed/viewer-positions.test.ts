import { describe, expect, it } from "vitest";

import {
  MAX_POSITIONS,
  MAX_POSITIONS_LENGTH,
  parsePositions,
  readPosition,
  serializePositions,
  writePosition
} from "./viewer-positions";

describe("viewer positions", () => {
  it("ghi rồi đọc lại vị trí của từng bộ lọc", () => {
    let positions = writePosition(new Map(), "all", "all", "v6:a");
    positions = writePosition(positions, "science", "curious", "v6:b");

    const restored = parsePositions(serializePositions(positions));

    expect(readPosition(restored, "all", "all")).toBe("v6:a");
    expect(readPosition(restored, "science", "curious")).toBe("v6:b");
    expect(readPosition(restored, "peace", "all")).toBeNull();
  });

  it("bộ lọc vừa dùng nằm cuối; đầy thì bỏ cái lâu nhất", () => {
    const topics = [
      "peace",
      "stories",
      "science",
      "nature",
      "psychology",
      "perspective",
      "cute"
    ] as const;
    let positions: Map<string, string> = new Map();

    for (const topic of topics) {
      positions = writePosition(positions, topic, "all", `v6:${topic}`);
    }

    positions = writePosition(positions, "stories", "all", "v6:again");

    expect(positions.size).toBe(MAX_POSITIONS);
    expect(readPosition(positions, "peace", "all")).toBeNull();
    expect([...positions.keys()].at(-1)).toBe("stories:all");
    expect(readPosition(positions, "stories", "all")).toBe("v6:again");
  });

  it("luôn nằm dưới giới hạn độ dài của cột", () => {
    let positions: Map<string, string> = new Map();
    const long = `v6:${"a".repeat(1000)}`;

    for (const topic of ["peace", "stories", "science", "nature", "cute"] as const) {
      positions = writePosition(positions, topic, "all", long);
    }

    expect(serializePositions(positions).length).toBeLessThanOrEqual(
      MAX_POSITIONS_LENGTH
    );
    expect(readPosition(positions, "cute", "all")).toBe(long);
  });

  it("JSON hỏng hoặc mục lạ thì bỏ qua", () => {
    expect(parsePositions(null).size).toBe(0);
    expect(parsePositions("not json").size).toBe(0);
    expect(parsePositions("[1,2]").size).toBe(0);

    const parsed = parsePositions(
      JSON.stringify({
        "all:all": "v6:ok",
        "Bad_Topic:all": "v6:x",
        "all:all:extra": "v6:x",
        "peace:sad": 42,
        "nature:all": ""
      })
    );

    expect([...parsed.entries()]).toEqual([["all:all", "v6:ok"]]);
  });
});
