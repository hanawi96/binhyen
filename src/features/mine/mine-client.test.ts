import { describe, expect, it } from "vitest";

import {
  readDraft,
  readMinePostPage,
  readPostError,
  readPostOutcome
} from "./mine-client";

const post = {
  id: "p1",
  title: "Buổi sáng",
  category: "Câu chuyện",
  description: "",
  theme: "story",
  status: "draft",
  createdAt: 100,
  fresh: false,
  note: null
};

describe("readMinePostPage", () => {
  it("reads posts, cursor and total", () => {
    expect(
      readMinePostPage({
        success: true,
        items: [post],
        nextCursor: "100.p1",
        total: 3
      })
    ).toEqual({ items: [post], nextCursor: "100.p1", total: 3 });
  });

  it("drops bad rows and falls back on unknown theme", () => {
    expect(
      readMinePostPage({
        success: true,
        items: [
          { ...post, theme: "space" },
          { ...post, id: "p2", status: "deleted" },
          { ...post, id: 3 }
        ]
      })
    ).toEqual({
      items: [{ ...post, theme: "peace" }],
      nextCursor: null,
      total: null
    });
  });

  it("marks only a strict true as a fresh review result", () => {
    const page = readMinePostPage({
      success: true,
      items: [
        { ...post, status: "published", fresh: true },
        { ...post, id: "p2", fresh: 1 },
        { ...post, id: "p3", fresh: undefined }
      ]
    });

    expect(page?.items.map((item) => item.fresh)).toEqual([true, false, false]);
  });

  it("reads a rejection note and drops empty ones", () => {
    const page = readMinePostPage({
      success: true,
      items: [
        { ...post, status: "archived", note: "Trùng bài cũ" },
        { ...post, id: "p2", status: "archived", note: "" },
        { ...post, id: "p3", note: 7 }
      ]
    });

    expect(page?.items.map((item) => item.note)).toEqual([
      "Trùng bài cũ",
      null,
      null
    ]);
  });

  it("rejects failed responses", () => {
    expect(readMinePostPage({ success: false, items: [] })).toBeNull();
    expect(readMinePostPage(null)).toBeNull();
  });
});

describe("readPostOutcome", () => {
  it("returns the saved post", () => {
    expect(readPostOutcome(201, { success: true, post })).toEqual({
      ok: true,
      post
    });
  });

  it("shows the server's Vietnamese reason for fixable errors", () => {
    expect(
      readPostOutcome(409, { error: "Đã có một bài với cùng câu chữ." })
    ).toEqual({ ok: false, message: "Đã có một bài với cùng câu chữ." });
    expect(
      readPostOutcome(429, { error: "Bạn đang có 30 bản nháp." })
    ).toEqual({ ok: false, message: "Bạn đang có 30 bản nháp." });
  });

  it("uses its own wording for session, rate limit and unknown errors", () => {
    const signedOut = readPostOutcome(401, { error: "Not signed in" });
    const tooFast = readPostOutcome(429, { error: "Too many requests" });
    const broken = readPostOutcome(500, { error: "boom" });

    expect(signedOut.ok || signedOut.message).toContain("đăng nhập");
    expect(tooFast.ok || tooFast.message).toContain("hơi nhanh");
    expect(broken.ok || broken.message).toBe("Chưa gửi được bài. Hãy thử lại.");
    expect(readPostOutcome(201, { post: {} }).ok).toBe(false);
  });
});

describe("readPostError", () => {
  it("passes through a not-found reason and keeps a custom fallback", () => {
    expect(readPostError(404, { error: "Không tìm thấy bài." })).toBe(
      "Không tìm thấy bài."
    );
    expect(readPostError(500, null, "Chưa rút được bài.")).toBe(
      "Chưa rút được bài."
    );
  });
});

describe("readDraft", () => {
  it("reads a draft and drops non-text topics", () => {
    expect(
      readDraft({
        post: {
          id: "p1",
          title: "Sáng",
          description: "",
          body: "Gió nhẹ.",
          topics: ["nature", 3]
        }
      })
    ).toEqual({
      title: "Sáng",
      description: "",
      body: "Gió nhẹ.",
      topics: ["nature"]
    });
  });

  it("rejects incomplete drafts", () => {
    expect(readDraft({ post: { title: "Sáng" } })).toBeNull();
    expect(readDraft(null)).toBeNull();
  });
});
