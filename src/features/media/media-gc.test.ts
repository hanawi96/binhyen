import { describe, expect, it } from "vitest";

import { orphanLocalMediaKeys } from "./media-gc";

const localA =
  "/api/media/image/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg";
const localB =
  "/api/media/video/2026/10/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.mp4";
const localPoster =
  "/api/media/image/2026/10/cccccccccccccccccccccccccccccccc.webp";
const remote = "https://cdn.example.com/keep.jpg";

describe("orphanLocalMediaKeys", () => {
  it("drops local keys no longer referenced", () => {
    expect(
      orphanLocalMediaKeys(
        [localA, localPoster, remote],
        [localB, remote]
      )
    ).toEqual([
      "image/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg",
      "image/2026/10/cccccccccccccccccccccccccccccccc.webp"
    ]);
  });

  it("keeps keys still in use and ignores remote URLs", () => {
    expect(orphanLocalMediaKeys([localA, remote], [localA])).toEqual([]);
    expect(orphanLocalMediaKeys([remote], [])).toEqual([]);
  });

  it("treats full removal as orphaning every local key", () => {
    expect(orphanLocalMediaKeys([localA, localB], [])).toEqual([
      "image/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg",
      "video/2026/10/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.mp4"
    ]);
  });
});
