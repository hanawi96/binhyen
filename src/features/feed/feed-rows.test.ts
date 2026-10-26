import { describe, expect, it } from "vitest";

import { mapRow, readPollOptions, toContentItem, type ContentRow } from "./feed-rows";

function baseRow(overrides: Partial<ContentRow> = {}): ContentRow {
  return {
    id: "c1",
    slug: "c1",
    format: "text",
    kind: "quote",
    status: "published",
    category: "test",
    title: "Tiêu đề",
    description: "",
    tag: "",
    theme: "peace",
    source_label: null,
    source_url: null,
    published_at: 100,
    rank_key: 1,
    seq: 1,
    author_name: null,
    topics_json: '["peace"]',
    moods_json: '["calm"]',
    has_article: 0,
    like_count: 0,
    save_count: 0,
    share_count: 0,
    media_json: null,
    poll_options_json: null,
    ...overrides
  };
}

describe("readPollOptions", () => {
  it("nhận mảng JSON hợp lệ o1..o4", () => {
    expect(
      readPollOptions(
        JSON.stringify([
          { id: "o1", label: "Êm" },
          { id: "o2", label: "Mệt" }
        ])
      )
    ).toEqual([
      { id: "o1", label: "Êm" },
      { id: "o2", label: "Mệt" }
    ]);
  });

  it("bỏ khi ít hơn 2 đáp án hoặc id lạ", () => {
    expect(readPollOptions([{ id: "o1", label: "Một" }])).toBeUndefined();
    expect(
      readPollOptions([
        { id: "x1", label: "A" },
        { id: "o2", label: "B" }
      ])
    ).toBeUndefined();
    expect(readPollOptions("[]")).toBeUndefined();
    expect(readPollOptions(null)).toBeUndefined();
  });
});

describe("mapRow media + poll", () => {
  it("gắn image từ media_json khi format image", () => {
    const row = mapRow(
      baseRow({
        format: "image",
        media_json: JSON.stringify({
          kind: "image",
          url: "https://example.com/a.jpg",
          alt: "Núi",
          width: 720,
          height: 900,
          poster_url: null
        })
      })
    );

    expect(row.image).toEqual({
      url: "https://example.com/a.jpg",
      alt: "Núi",
      width: 720,
      height: 900
    });
    expect(row.video).toBeUndefined();
    expect(toContentItem(row).image?.url).toBe("https://example.com/a.jpg");
  });

  it("gắn video + poster từ media_json", () => {
    const row = mapRow(
      baseRow({
        format: "video",
        media_json: JSON.stringify({
          kind: "video",
          url: "https://example.com/v.mp4",
          alt: "Clip",
          width: 1280,
          height: 720,
          poster_url: "https://example.com/p.jpg"
        })
      })
    );

    expect(row.video).toEqual({
      url: "https://example.com/v.mp4",
      alt: "Clip",
      poster: "https://example.com/p.jpg",
      width: 1280,
      height: 720
    });
  });

  it("gắn pollOptions khi format poll", () => {
    const row = mapRow(
      baseRow({
        format: "poll",
        poll_options_json: JSON.stringify([
          { id: "o1", label: "A" },
          { id: "o2", label: "B" },
          { id: "o3", label: "C" }
        ])
      })
    );

    expect(row.pollOptions).toEqual([
      { id: "o1", label: "A" },
      { id: "o2", label: "B" },
      { id: "o3", label: "C" }
    ]);
    expect(toContentItem(row).pollOptions?.length).toBe(3);
  });

  it("gắn source khi có source_label (câu nói)", () => {
    const row = mapRow(
      baseRow({
        format: "quote",
        source_label: " Nguyễn Du ",
        source_url: "https://example.com/nguyen-du"
      })
    );

    expect(row.source).toEqual({
      label: "Nguyễn Du",
      url: "https://example.com/nguyen-du"
    });
    expect(toContentItem(row).source?.label).toBe("Nguyễn Du");
  });

  it("gắn authorName từ author_name, không đụng source", () => {
    const row = mapRow(
      baseRow({
        format: "text",
        kind: "story",
        author_name: "  Lan Anh  "
      })
    );

    expect(row.authorName).toBe("Lan Anh");
    expect(row.source).toBeUndefined();
    expect(toContentItem(row).authorName).toBe("Lan Anh");
  });

  it("bỏ authorName khi author_name rỗng", () => {
    const row = mapRow(baseRow({ author_name: "   " }));
    expect(row.authorName).toBeUndefined();
    expect(toContentItem(row).authorName).toBeUndefined();
  });

  it("không gắn media khi format text dù có media_json", () => {
    const row = mapRow(
      baseRow({
        format: "text",
        media_json: JSON.stringify({
          kind: "image",
          url: "https://example.com/a.jpg",
          alt: "",
          width: 1,
          height: 1,
          poster_url: null
        })
      })
    );

    expect(row.image).toBeUndefined();
    expect(row.video).toBeUndefined();
  });
});
