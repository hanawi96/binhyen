import { describe, expect, it } from "vitest";

import { decodePeopleCursor, encodePeopleCursor } from "./people-cursor";

describe("people cursor", () => {
  it("round-trips", () => {
    const cursor = { publishedAt: 1_700_000_000, id: "c76a01a4a0f4611c32e" };

    expect(decodePeopleCursor(encodePeopleCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed values", () => {
    expect(decodePeopleCursor("")).toBeNull();
    expect(decodePeopleCursor("p1:0:abc")).toBeNull();
    expect(decodePeopleCursor("p1:x:abc")).toBeNull();
    expect(decodePeopleCursor("p1:3:")).toBeNull();
    expect(decodePeopleCursor("p1:3:%E0%A4%A")).toBeNull();
    expect(decodePeopleCursor("l1:12:abc")).toBeNull();
    expect(decodePeopleCursor("v3:1:abc:all:all")).toBeNull();
  });
});
