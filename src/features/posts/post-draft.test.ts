import { describe, expect, it } from "vitest";

import { parsePostDraft } from "./post-draft";

describe("parsePostDraft", () => {
  it("builds a story draft with category from the first topic", () => {
    expect(
      parsePostDraft({
        title: "  Một buổi sáng  ",
        body: "Trời trong.",
        topics: ["nature", "peace", "nature"]
      })
    ).toEqual({
      ok: true,
      value: {
        title: "Một buổi sáng",
        description: "",
        body: "Trời trong.",
        topics: ["nature", "peace"],
        moods: [],
        format: "text",
        kind: "story",
        tag: "",
        sourceLabel: "",
        sourceUrl: "",
        imageUrl: "",
        imageAlt: "",
        imageWidth: null,
        imageHeight: null,
        posterUrl: "",
        pollOptions: [],
        collectionIds: [],
        theme: "peace",
        category: "Thiên nhiên kỳ thú"
      }
    });
  });

  it("requires a title and 1 to 3 valid topic slugs", () => {
    expect(parsePostDraft({ title: " ", topics: ["peace"] }).ok).toBe(false);
    expect(parsePostDraft({ title: "A", topics: [] }).ok).toBe(false);
    expect(parsePostDraft({ title: "A", topics: ["X"] }).ok).toBe(false);
    expect(
      parsePostDraft({
        title: "A",
        topics: ["peace", "nature", "cute", "tips"]
      }).ok
    ).toBe(false);
  });

  it("accepts a new catalog topic with category Khác", () => {
    const result = parsePostDraft({
      title: "A",
      topics: ["goc-nho"]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe("Khác");
  });

  it("rejects oversized or non-text fields", () => {
    expect(
      parsePostDraft({ title: "A", body: "x".repeat(8001), topics: ["peace"] })
        .ok
    ).toBe(false);
    expect(parsePostDraft(null).ok).toBe(false);
  });

  it("ignores fields users may not set", () => {
    const result = parsePostDraft({
      title: "A",
      topics: ["cute"],
      kind: "quote",
      description: "Bỏ qua",
      sourceUrl: "https://x.test"
    });

    expect(result.ok && result.value.kind).toBe("story");
    expect(result.ok && result.value.description).toBe("");
    expect(result.ok && result.value.sourceUrl).toBe("");
  });
});
