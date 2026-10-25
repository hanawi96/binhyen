import { describe, expect, it } from "vitest";

import { readContentFormat } from "./content-format";

describe("readContentFormat", () => {
  it("keeps known formats and defaults unknown values to text", () => {
    expect(readContentFormat("text")).toBe("text");
    expect(readContentFormat("poll")).toBe("poll");
    expect(readContentFormat("prompt")).toBe("prompt");
    expect(readContentFormat("quote")).toBe("quote");
    expect(readContentFormat("image")).toBe("image");
    expect(readContentFormat("video")).toBe("video");
    expect(readContentFormat("")).toBe("text");
    expect(readContentFormat(null)).toBe("text");
    expect(readContentFormat("story")).toBe("text");
  });
});
