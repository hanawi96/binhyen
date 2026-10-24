import { describe, expect, it } from "vitest";

import { parsePostDraft } from "./post-draft";

describe("parsePostDraft", () => {
  it("builds a story draft styled by the first topic", () => {
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
        kind: "story",
        tag: "",
        sourceLabel: "",
        sourceUrl: "",
        theme: "nature",
        category: "Thiên nhiên kỳ thú"
      }
    });
  });

  it("requires a title and 1 to 3 known topics", () => {
    expect(parsePostDraft({ title: " ", topics: ["peace"] }).ok).toBe(false);
    expect(parsePostDraft({ title: "A", topics: [] }).ok).toBe(false);
    expect(parsePostDraft({ title: "A", topics: ["space"] }).ok).toBe(false);
    expect(
      parsePostDraft({
        title: "A",
        topics: ["peace", "nature", "cute", "tips"]
      }).ok
    ).toBe(false);
  });

  it("rejects oversized or non-text fields", () => {
    expect(
      parsePostDraft({ title: "A", body: "x".repeat(8001), topics: ["peace"] })
        .ok
    ).toBe(false);
    expect(
      parsePostDraft({ title: "A", description: 5, topics: ["peace"] }).ok
    ).toBe(false);
    expect(parsePostDraft(null).ok).toBe(false);
  });

  it("ignores fields users may not set", () => {
    const result = parsePostDraft({
      title: "A",
      topics: ["cute"],
      kind: "quote",
      sourceUrl: "https://x.test"
    });

    expect(result.ok && result.value.kind).toBe("story");
    expect(result.ok && result.value.sourceUrl).toBe("");
  });
});
