import { describe, expect, it } from "vitest";

import {
  canTransitionContent,
  contentFingerprint,
  normalizeContentText,
  normalizeSlug,
  transitionContent
} from "./content-lifecycle";

describe("Content lifecycle", () => {
  it("publishes a draft and keeps the first publish time", () => {
    const first = transitionContent(
      "draft",
      "published",
      null,
      100
    );

    expect(first).toEqual({
      status: "published",
      publishedAt: 100
    });

    const again = transitionContent(
      "draft",
      "published",
      100,
      250
    );

    expect(again.publishedAt).toBe(100);
  });

  it("archives a published post without clearing its publish time", () => {
    const result = transitionContent(
      "published",
      "archived",
      100,
      250
    );

    expect(result).toEqual({
      status: "archived",
      publishedAt: 100
    });
  });

  it("archives a draft that was never published", () => {
    const result = transitionContent(
      "draft",
      "archived",
      null,
      100
    );

    expect(result).toEqual({
      status: "archived",
      publishedAt: null
    });
  });

  it("returns a published post to draft and keeps the publish time", () => {
    expect(canTransitionContent("published", "draft")).toBe(true);

    expect(
      transitionContent("published", "draft", 100, 250)
    ).toEqual({
      status: "draft",
      publishedAt: 100
    });
  });

  it("refuses to bring an archived post back", () => {
    expect(canTransitionContent("archived", "published")).toBe(
      false
    );
    expect(canTransitionContent("archived", "draft")).toBe(
      false
    );

    expect(() =>
      transitionContent("archived", "published", 100, 250)
    ).toThrow("Cannot change content from archived to published");
  });

  it("builds a stable slug from a Vietnamese title", () => {
    expect(normalizeSlug("  Bình Yên, mỗi ngày! ")).toBe(
      "binh-yen-moi-ngay"
    );
    expect(normalizeSlug("Đời sống")).toBe("doi-song");
    expect(() => normalizeSlug(" --- ")).toThrow("Slug is empty");
  });

  it("hashes the same wording once", async () => {
    const left = await contentFingerprint([
      "  Bình Yên  ",
      "Một\nngày   dịu dàng."
    ]);
    const right = await contentFingerprint([
      normalizeContentText("bình yên"),
      "một ngày dịu dàng."
    ]);
    const other = await contentFingerprint([
      "Bình Yên",
      "Một ngày khác."
    ]);

    expect(left).toBe(right);
    expect(left).not.toBe(other);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
  });
});
