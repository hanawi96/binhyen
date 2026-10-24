import { describe, expect, it } from "vitest";

import { parseProfileUpdate } from "./profile";

describe("parseProfileUpdate", () => {
  it("cleans the name and removes repeated topics", () => {
    expect(
      parseProfileUpdate({
        displayName: "  Mai   Anh ",
        topics: ["peace", "nature", "peace"]
      })
    ).toEqual({ displayName: "Mai Anh", topics: ["peace", "nature"] });
  });

  it("accepts no topics", () => {
    expect(parseProfileUpdate({ displayName: "An", topics: [] })).toEqual({
      displayName: "An",
      topics: []
    });
  });

  it("rejects bad names and unknown topics", () => {
    expect(parseProfileUpdate({ displayName: "  ", topics: [] })).toBeNull();
    expect(
      parseProfileUpdate({ displayName: "a".repeat(61), topics: [] })
    ).toBeNull();
    expect(
      parseProfileUpdate({ displayName: "An", topics: ["all"] })
    ).toBeNull();
    expect(
      parseProfileUpdate({ displayName: "An", topics: ["peace", 1] })
    ).toBeNull();
    expect(parseProfileUpdate({ displayName: "An" })).toBeNull();
    expect(parseProfileUpdate(null)).toBeNull();
  });

  it("rejects more than eight topics", () => {
    expect(
      parseProfileUpdate({
        displayName: "An",
        topics: Array.from({ length: 9 }, () => "peace")
      })
    ).toBeNull();
  });
});
