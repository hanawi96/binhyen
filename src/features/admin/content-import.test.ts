import { describe, expect, it } from "vitest";

import {
  draftFromImportRow,
  mapHeaderIndexes,
  rowRecord
} from "./content-import";

const catalog = {
  topics: [
    { slug: "peace", label: "Tình Yêu" },
    { slug: "stories", label: "Câu chuyện" }
  ],
  moods: [
    { slug: "calm", label: "Bình yên" },
    { slug: "hope", label: "Hy vọng" }
  ]
};

describe("content-import", () => {
  it("maps excel headers and quote row by slug", () => {
    const indexes = mapHeaderIndexes([
      "format",
      "title",
      "topics",
      "moods",
      "sourceLabel",
      "sourceUrl",
      "body"
    ]);
    expect(indexes?.get("format")).toBe(0);

    const record = rowRecord(
      ["quote", "Sống chậm lại", "peace", "", "Lão Tử", "", ""],
      indexes!
    );
    const draft = draftFromImportRow(record, catalog);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.value.format).toBe("quote");
    expect(draft.value.sourceLabel).toBe("Lão Tử");
    expect(draft.value.topics).toEqual(["peace"]);
  });

  it("maps Vietnamese headers and labels from DB", () => {
    const indexes = mapHeaderIndexes([
      "Định dạng",
      "Tiêu đề",
      "Chủ đề",
      "Tâm trạng",
      "Nguồn",
      "Link nguồn",
      "Nội dung dài"
    ]);
    expect(indexes?.get("format")).toBe(0);
    expect(indexes?.get("topics")).toBe(2);

    const draft = draftFromImportRow(
      {
        format: "Câu nói",
        title: "Sống chậm lại",
        topics: "Tình Yêu",
        moods: "Bình yên",
        sourceLabel: "Lão Tử",
        sourceUrl: "",
        body: ""
      },
      catalog
    );
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.value.format).toBe("quote");
    expect(draft.value.topics).toEqual(["peace"]);
    expect(draft.value.moods).toEqual(["calm"]);
  });

  it("rejects bad format", () => {
    const draft = draftFromImportRow(
      {
        format: "video",
        title: "x",
        topics: "Tình Yêu"
      },
      catalog
    );
    expect(draft.ok).toBe(false);
  });

  it("rejects unknown topic label", () => {
    const draft = draftFromImportRow(
      {
        format: "Bài viết",
        title: "x",
        topics: "Không tồn tại"
      },
      catalog
    );
    expect(draft.ok).toBe(false);
  });

  it("accepts multiple topics with pipe", () => {
    const draft = draftFromImportRow(
      {
        format: "text",
        title: "Một ngày đủ nhẹ",
        topics: "Tình Yêu|Câu chuyện",
        moods: "",
        sourceLabel: "",
        sourceUrl: "",
        body: "Giữ nhịp thở."
      },
      catalog
    );
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.value.topics).toEqual(["peace", "stories"]);
    expect(draft.value.format).toBe("text");
  });
});
