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
  topics: ["peace"],
  moods: ["calm", "tired"],
  sourceLabel: "Sổ tay",
  sourceUrl: "https://example.com/note",
  body: "Nội dung dài hơn."
};

describe("Content draft", () => {
  it("builds display fields from the first topic", () => {
    const result = parseContentDraft(draft);

    expect(result).toEqual({
      ok: true,
      value: {
        title: "Một câu dịu dàng",
        description: "",
        category: "Chữa lành & bình yên",
        tag: "",
        format: "text",
        kind: "story",
        theme: "peace",
        topics: ["peace"],
        moods: ["calm", "tired"],
        sourceLabel: "Sổ tay",
        sourceUrl: "https://example.com/note",
        body: "Nội dung dài hơn.",
        imageUrl: "",
        imageAlt: "",
        imageWidth: null,
        imageHeight: null,
        posterUrl: "",
        pollOptions: [],
        collectionIds: []
      }
    });
  });

  it("accepts an image draft with an HTTPS URL", () => {
    const result = parseContentDraft({
      title: "Ánh sáng sớm",
      format: "image",
      topics: ["nature"],
      moods: ["calm"],
      imageUrl: "https://images.example.com/dawn.jpg",
      imageAlt: "Bình minh",
      imageWidth: "720",
      imageHeight: 900
    });

    expect(result.ok && result.value).toMatchObject({
      format: "image",
      body: "",
      imageUrl: "https://images.example.com/dawn.jpg",
      imageAlt: "Bình minh",
      imageWidth: 720,
      imageHeight: 900
    });
    expect(
      parseContentDraft({
        title: "Thiếu ảnh",
        format: "image",
        topics: ["nature"],
        moods: []
      }).ok
    ).toBe(false);
    expect(
      parseContentDraft({
        title: "HTTP",
        format: "image",
        topics: ["nature"],
        moods: [],
        imageUrl: "http://insecure.example/a.jpg"
      }).ok
    ).toBe(false);
    expect(
      parseContentDraft({
        title: "R2 local",
        format: "image",
        topics: ["nature"],
        moods: [],
        imageUrl:
          "/api/media/image/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg"
      }).ok
    ).toBe(true);
  });

  it("accepts a video draft with HTTPS media and optional poster", () => {
    const result = parseContentDraft({
      title: "Gió qua lá",
      format: "video",
      topics: ["nature"],
      moods: ["calm"],
      imageUrl: "https://cdn.example.com/breeze.mp4",
      imageAlt: "Lá rung nhẹ",
      posterUrl: "https://cdn.example.com/breeze.jpg",
      imageWidth: 1280,
      imageHeight: 720
    });

    expect(result.ok && result.value).toMatchObject({
      format: "video",
      body: "",
      imageUrl: "https://cdn.example.com/breeze.mp4",
      posterUrl: "https://cdn.example.com/breeze.jpg",
      imageWidth: 1280,
      imageHeight: 720
    });
    expect(
      parseContentDraft({
        title: "Thiếu video",
        format: "video",
        topics: ["nature"],
        moods: []
      }).ok
    ).toBe(false);
  });

  it("accepts a poll draft with 2 to 4 options", () => {
    const result = parseContentDraft({
      title: "Hôm nay bạn thế nào?",
      format: "poll",
      topics: ["peace"],
      moods: ["calm"],
      pollOptions: ["Êm", "Hơi mệt", "Vui"]
    });

    expect(result.ok && result.value).toMatchObject({
      format: "poll",
      body: "",
      pollOptions: ["Êm", "Hơi mệt", "Vui"]
    });
    expect(
      parseContentDraft({
        title: "Hỏi",
        format: "poll",
        topics: ["peace"],
        moods: [],
        pollOptions: ["Một"]
      }).ok
    ).toBe(false);
  });

  it("ignores client kind, theme, category, and description", () => {
    const result = parseContentDraft({
      ...draft,
      topics: ["nature"],
      kind: "quote",
      theme: "cute",
      category: "Khác",
      description: "Không dùng"
    });

    expect(result.ok && result.value).toMatchObject({
      kind: "story",
      theme: "nature",
      category: "Thiên nhiên kỳ thú",
      description: ""
    });
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
    expect(parseContentDraft({ ...draft, topics: [] }).ok).toBe(false);
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
