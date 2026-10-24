import { describe, expect, it } from "vitest";

import {
  decodeCollectionCursor,
  encodeCollectionCursor
} from "./collection-cursor";

describe("collection cursor", () => {
  it("round-trips", () => {
    const value = encodeCollectionCursor({ sortOrder: 0, id: "cabc" });
    expect(decodeCollectionCursor(value)).toEqual({
      sortOrder: 0,
      id: "cabc"
    });
  });

  it("rejects bad input", () => {
    expect(decodeCollectionCursor("nope")).toBeNull();
    expect(decodeCollectionCursor("c1:x:y")).toBeNull();
  });
});
