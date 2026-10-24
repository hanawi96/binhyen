import { describe, expect, it } from "vitest";

import { decodeLovedCursor, encodeLovedCursor } from "./loved-cursor";

describe("loved cursor", () => {
  it("round-trips", () => {
    const cursor = { likeCount: 12, id: "c76a01a4a0f4611c32e" };

    expect(decodeLovedCursor(encodeLovedCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed values", () => {
    expect(decodeLovedCursor("")).toBeNull();
    expect(decodeLovedCursor("l1:0:abc")).toBeNull();
    expect(decodeLovedCursor("l1:x:abc")).toBeNull();
    expect(decodeLovedCursor("l1:3:")).toBeNull();
    expect(decodeLovedCursor("l1:3:%E0%A4%A")).toBeNull();
    expect(decodeLovedCursor("v3:1:abc:all:all")).toBeNull();
  });
});
