import { describe, expect, it } from "vitest";
import {
  ATMOSPHERE_COUNT,
  atmosphereLayout,
  buildAtmosphereMap,
  pickAtmosphereId
} from "./atmosphere-presets";

describe("atmosphere-presets", () => {
  it("có đúng 30 preset", () => {
    expect(ATMOSPHERE_COUNT).toBe(30);
  });

  it("không gán cùng layout cho hai id liền nhau", () => {
    const ids = Array.from({ length: 80 }, (_, i) => `item-${i}`);
    const map = buildAtmosphereMap(ids);
    let prev = -1;
    for (const id of ids) {
      const n = map.get(id)!;
      if (prev >= 0) {
        expect(n).not.toBe(prev);
        expect(atmosphereLayout(n)).not.toBe(atmosphereLayout(prev));
      }
      prev = n;
    }
  });

  it("pickAtmosphereId tránh trùng previous", () => {
    const n = pickAtmosphereId("seed-a", 3);
    expect(n).not.toBe(3);
    expect(atmosphereLayout(n)).not.toBe(atmosphereLayout(3));
  });
});
