import { describe, expect, it } from "vitest";

import { clampVolume } from "./ambient-prefs";
import {
  findAmbientTrack,
  nextAmbientTrackId,
  setAmbientCatalog,
  getAmbientCatalog
} from "./tracks";

describe("ambient tracks and volume", () => {
  it("clamps volume and resolves remote catalog tracks", () => {
    expect(clampVolume(1.4)).toBe(1);
    expect(clampVolume(-2)).toBe(0);

    setAmbientCatalog(
      [
        {
          id: "t1",
          title: "Piano êm",
          src: "/api/media/audio/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp3"
        },
        {
          id: "t2",
          title: "Mưa",
          src: "/api/media/audio/2026/10/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.mp3"
        }
      ],
      "t1"
    );

    expect(findAmbientTrack("t1")?.title).toBe("Piano êm");
    expect(findAmbientTrack(null)?.id).toBe("t1");
    expect(getAmbientCatalog().length).toBe(2);
    expect(nextAmbientTrackId("t1")).toBe("t2");
  });
});
