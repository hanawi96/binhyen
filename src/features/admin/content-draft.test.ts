import { describe, expect, it } from "vitest";

import {
  decodeAdminCursor,
  encodeAdminCursor,
  likeContains,
  parseAdminListQuery,
  parseContentDraft
} from "./content-draft";

const draft = {
  title: "Một câu dịu dàng",
  description: "Dành cho buổi tối.",
  category: "Chữa lành & bình yên",
  tag: "Nhẹ nhàng",
  kind: "quote",
  theme: "peace",
  topics: ["peace"],
  moods: ["calm", "tired"],
  sourceLabel: "Sổ tay",
  sourceUrl: "https://example.com/note",
  body: "Nội dung dài hơn."
};

describe("Content draft", () => {
  it("keeps a complete draft", () => {
    const result = parseContentDraft(draft);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.title).toBe(draft.title);
      expect(result.value.topics).toEqual(["peace"]);
    }
  });

  it("rejects an empty title, a bad link, and an unknown topic", () => {
    expect(parseContentDraft({ ...draft, title: "  " }).ok).toBe(false);
    expect(
      parseContentDraft({
        ...draft,
        sourceUrl: "javascript:alert(1)"
      }).ok
    ).toBe(false);
    expect(parseContentDraft({ ...draft, topics: ["nope"] }).ok).toBe(
      false
    );
  });

  it("reads the next page without trusting a broken cursor", () => {
    expect(encodeAdminCursor("updated", 20, "post-1")).toBe(
      "u.20.post-1"
    );
    expect(encodeAdminCursor("created", 20, "post-1")).toBe(
      "c.20.post-1"
    );
    expect(decodeAdminCursor("u.20.post-1")).toEqual({
      sort: "updated",
      at: 20,
      id: "post-1"
    });
    expect(decodeAdminCursor("20.post-1")).toEqual({
      sort: "updated",
      at: 20,
      id: "post-1"
    });
    expect(decodeAdminCursor("20.post 1")).toBeNull();

    const query = parseAdminListQuery({
      status: "published",
      q: "bình",
      kind: "quote",
      topic: "peace",
      sort: "updated",
      review: "1",
      cursor: "u.20.post-1",
      limit: "12"
    });

    expect(query).toEqual({
      ok: true,
      value: {
        status: "published",
        q: "bình",
        kind: "quote",
        topic: "peace",
        sort: "updated",
        review: true,
        cursor: { sort: "updated", at: 20, id: "post-1" },
        limit: 12
      }
    });
    expect(
      parseAdminListQuery({
        status: "all",
        q: null,
        kind: "song",
        topic: null,
        sort: "created",
        review: null,
        cursor: "u.20.post-1",
        limit: null
      }).ok
    ).toBe(false);
    expect(likeContains("100%_a")).toBe("%100\\%\\_a%");
  });
});
