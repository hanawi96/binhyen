import { describe, expect, it } from "vitest";

import {
  parseRecentSeen,
  pushRecentSeen,
  readRecentSeen,
  RECENT_SEEN_KEY,
  RECENT_SEEN_MAX,
  writeRecentSeen
} from "./recent-seen";

describe("Recently seen cards", () => {
  it("moves a repeated id to the newest end and keeps the limit", () => {
    expect(pushRecentSeen(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    expect(pushRecentSeen(["a", "b", "c"], "d", 3)).toEqual(["b", "c", "d"]);

    let list: string[] = [];

    for (let i = 0; i < RECENT_SEEN_MAX + 50; i++) {
      list = pushRecentSeen(list, `id${i}`);
    }

    expect(list).toHaveLength(RECENT_SEEN_MAX);
    expect(list[0]).toBe("id50");
    expect(list[list.length - 1]).toBe(`id${RECENT_SEEN_MAX + 49}`);
  });

  it("ignores broken or foreign data", () => {
    expect(parseRecentSeen(null)).toEqual([]);
    expect(parseRecentSeen("not json")).toEqual([]);
    expect(parseRecentSeen('{"a":1}')).toEqual([]);
    expect(parseRecentSeen(JSON.stringify(["a", 1, "", "b", "a", "x".repeat(129)]))).toEqual(
      ["b", "a"]
    );
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      }
    };

    expect(readRecentSeen(broken)).toEqual([]);
    expect(() => writeRecentSeen(broken, ["a"])).not.toThrow();
  });

  it("round-trips through storage", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      }
    };

    writeRecentSeen(storage, ["a", "b"]);

    expect(data.has(RECENT_SEEN_KEY)).toBe(true);
    expect(readRecentSeen(storage)).toEqual(["a", "b"]);
  });
});
