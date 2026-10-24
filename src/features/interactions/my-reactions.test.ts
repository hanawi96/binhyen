import { describe, expect, it } from "vitest";

import {
  MY_PAGE_SIZE,
  decodeMyCursor,
  encodeMyCursor,
  parseMyKind,
  parseMyLimit
} from "./my-reactions";

describe("my reactions params", () => {
  it("accepts like and save only", () => {
    expect(parseMyKind("like")).toBe("like");
    expect(parseMyKind("save")).toBe("save");
    expect(parseMyKind("share")).toBeNull();
    expect(parseMyKind(null)).toBeNull();
  });

  it("clamps the page size", () => {
    expect(parseMyLimit(null)).toBe(MY_PAGE_SIZE);
    expect(parseMyLimit("0")).toBe(MY_PAGE_SIZE);
    expect(parseMyLimit("abc")).toBe(MY_PAGE_SIZE);
    expect(parseMyLimit("5")).toBe(5);
    expect(parseMyLimit("1000")).toBe(40);
  });

  it("round-trips the cursor", () => {
    const cursor = { reactedAt: 1792772591, id: "c76a01a4a0f4611c32e" };

    expect(decodeMyCursor(encodeMyCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed cursors", () => {
    expect(decodeMyCursor("")).toBeNull();
    expect(decodeMyCursor("abc.def")).toBeNull();
    expect(decodeMyCursor("123")).toBeNull();
    expect(decodeMyCursor("123.a b")).toBeNull();
    expect(decodeMyCursor("123.id'--")).toBeNull();
  });
});
