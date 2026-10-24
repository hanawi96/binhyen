import { describe, expect, it } from "vitest";

import {
  parseReactionRequest,
  parseShareChannel
} from "./content-reactions";

describe("parseReactionRequest", () => {
  it("accepts like and save with a boolean", () => {
    expect(parseReactionRequest({ kind: "like", on: true })).toEqual({
      kind: "like",
      on: true
    });
    expect(parseReactionRequest({ kind: "save", on: false })).toEqual({
      kind: "save",
      on: false
    });
  });

  it("rejects other kinds and non-boolean flags", () => {
    expect(parseReactionRequest({ kind: "share", on: true })).toBeNull();
    expect(parseReactionRequest({ kind: "like", on: "true" })).toBeNull();
    expect(parseReactionRequest({ kind: "like" })).toBeNull();
    expect(parseReactionRequest(null)).toBeNull();
    expect(parseReactionRequest(undefined)).toBeNull();
    expect(parseReactionRequest("like")).toBeNull();
  });
});

describe("parseShareChannel", () => {
  it("accepts known channels only", () => {
    expect(parseShareChannel({ channel: "native" })).toBe("native");
    expect(parseShareChannel({ channel: "copy_link" })).toBe("copy_link");
    expect(parseShareChannel({ channel: "other" })).toBe("other");
    expect(parseShareChannel({ channel: "email" })).toBeNull();
    expect(parseShareChannel({})).toBeNull();
    expect(parseShareChannel(undefined)).toBeNull();
  });
});
