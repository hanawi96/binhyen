import { describe, expect, it } from "vitest";

import {
  buildMediaKey,
  extensionForType,
  isSafeMediaKey,
  mediaKeyFromPath,
  mediaPublicPath,
  parseMediaUrl
} from "./media-ref";

describe("media-ref", () => {
  it("accepts HTTPS and local /api/media paths", () => {
    expect(parseMediaUrl("https://cdn.example/a.jpg")).toBe(
      "https://cdn.example/a.jpg"
    );
    expect(parseMediaUrl("http://insecure/a.jpg")).toBeNull();

    const key = "image/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg";
    expect(parseMediaUrl(mediaPublicPath(key))).toBe(`/api/media/${key}`);
    expect(parseMediaUrl("/api/media/../etc/passwd")).toBeNull();
  });

  it("maps content types and builds safe keys", () => {
    expect(extensionForType("image", "image/webp")).toBe("webp");
    expect(extensionForType("video", "video/mp4")).toBe("mp4");
    expect(extensionForType("audio", "audio/mpeg")).toBe("mp3");
    expect(extensionForType("image", "application/pdf")).toBeNull();

    const key = buildMediaKey("image", "jpg");
    expect(isSafeMediaKey(key)).toBe(true);
    expect(mediaKeyFromPath(mediaPublicPath(key))).toBe(key);

    const audioKey = buildMediaKey("audio", "mp3");
    expect(audioKey.startsWith("audio/")).toBe(true);
    expect(isSafeMediaKey(audioKey)).toBe(true);
    expect(mediaKeyFromPath(mediaPublicPath(audioKey))).toBe(audioKey);
  });
});

describe("ambient audio url shape", () => {
  it("accepts audio media paths", () => {
    const key = "audio/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp3";
    expect(parseMediaUrl(mediaPublicPath(key))).toBe(`/api/media/${key}`);
  });
});

