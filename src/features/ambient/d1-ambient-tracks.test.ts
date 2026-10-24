import { describe, expect, it } from "vitest";

import {
  normalizeAmbientAudioUrl,
  normalizeAmbientTitle
} from "./d1-ambient-tracks";

describe("ambient track validators", () => {
  it("normalizes title and audio-only urls", () => {
    expect(normalizeAmbientTitle("  Piano êm  ")).toBe("Piano êm");
    expect(normalizeAmbientTitle("")).toBeNull();
    expect(normalizeAmbientTitle("x".repeat(81))).toBeNull();

    const audio = "/api/media/audio/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp3";
    expect(normalizeAmbientAudioUrl(audio)).toBe(audio);
    expect(
      normalizeAmbientAudioUrl(
        "/api/media/image/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg"
      )
    ).toBeNull();
    expect(normalizeAmbientAudioUrl("https://cdn.example/a.mp3")).toBeNull();
  });
});
