import { describe, expect, it } from "vitest";

import { layoutLabel, mediaLayout } from "./media-dimensions";

describe("mediaLayout", () => {
  it("classifies portrait, landscape, and square", () => {
    expect(mediaLayout(1080, 1920)).toBe("portrait");
    expect(mediaLayout(1920, 1080)).toBe("landscape");
    expect(mediaLayout(800, 800)).toBe("square");
    expect(mediaLayout(null, 100)).toBe("unknown");
    expect(layoutLabel("portrait")).toBe("dọc");
    expect(layoutLabel("landscape")).toBe("ngang");
  });
});
