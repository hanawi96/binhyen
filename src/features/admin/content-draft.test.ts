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

  it("promotes story drafts to image when a media URL is present", () => {
    const withImage = parseContentDraft({
      title: "Ánh sáng sớm",
      format: "text",
      topics: ["nature"],
      moods: ["calm"],
      imageUrl: "https://images.example.com/dawn.jpg",
      imageAlt: "Bình minh",
      imageWidth: "720",
      imageHeight: 900,
      body: "Mặt trời lên chậm trên đồi."
    });

    expect(withImage.ok && withImage.value).toMatchObject({
      format: "image",
      body: "Mặt trời lên chậm trên đồi.",
      imageUrl: "https://images.example.com/dawn.jpg",
      imageAlt: "Bình minh",
      imageWidth: 720,
      imageHeight: 900
    });

    const textOnly = parseContentDraft({
      title: "Chỉ chữ",
      format: "image",
      topics: ["nature"],
      moods: ["calm"],
      body: "Không có ảnh."
    });
    expect(textOnly.ok && textOnly.value).toMatchObject({
      format: "text",
      body: "Không có ảnh.",
      imageUrl: ""
    });

    expect(
      parseContentDraft({
        title: "HTTP",
        format: "text",
        topics: ["nature"],
        moods: [],
        imageUrl: "http://insecure.example/a.jpg"
      }).ok
    ).toBe(false);
    expect(
      parseContentDraft({
        title: "R2 local",
        format: "text",
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
      imageHeight: 720,
      body: "Lá kể chuyện gió."
    });

    expect(result.ok && result.value).toMatchObject({
      format: "video",
      body: "Lá kể chuyện gió.",
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

  it("accepts a quote draft with required author", () => {
    const result = parseContentDraft({
      title: "Đời người ngắn lắm.",
      format: "quote",
      topics: ["perspective"],
      moods: ["calm"],
      sourceLabel: "Nguyễn Du"
    });

    expect(result.ok && result.value).toMatchObject({
      format: "quote",
      kind: "quote",
      sourceLabel: "Nguyễn Du",
      body: "",
      pollOptions: []
    });
    expect(
      parseContentDraft({
        title: "Một câu nói",
        format: "quote",
        topics: ["peace"],
        moods: ["calm"],
        sourceLabel: ""
      }).ok
    ).toBe(false);
  });

  it("accepts a prompt draft without poll options or media", () => {
    const result = parseContentDraft({
      title: "Hôm nay bạn đang mang gì trong người?",
      format: "prompt",
      topics: ["peace"],
      moods: ["tired"],
      body: "Không cần trả lời to. Chỉ cần nhận ra là đủ."
    });

    expect(result.ok && result.value).toMatchObject({
      format: "prompt",
      body: "Không cần trả lời to. Chỉ cần nhận ra là đủ.",
      imageUrl: "",
      pollOptions: []
    });
    expect(
      parseContentDraft({
        title: "",
        format: "prompt",
        topics: ["peace"],
        moods: ["calm"]
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
      theme: "peace",
      category: "Thiên nhiên kỳ thú",
      description: ""
    });
  });

  it("rejects an empty title, a bad link, and a bad topic slug", () => {
    expect(parseContentDraft({ ...draft, title: "  " }).ok).toBe(false);
    expect(
      parseContentDraft({
        ...draft,
        sourceUrl: "javascript:alert(1)"
      }).ok
    ).toBe(false);
    expect(parseContentDraft({ ...draft, topics: ["Nope"] }).ok).toBe(
      false
    );
    expect(parseContentDraft({ ...draft, topics: ["x"] }).ok).toBe(false);
    expect(parseContentDraft({ ...draft, topics: [] }).ok).toBe(false);
  });

  it("accepts a new catalog topic slug with category Khác", () => {
    const result = parseContentDraft({
      ...draft,
      topics: ["goc-nho"]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.topics).toEqual(["goc-nho"]);
    expect(result.value.category).toBe("Khác");
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
      format: "quote",
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
        format: "quote",
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
        format: "song",
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
