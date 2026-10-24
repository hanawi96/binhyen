import { describe, expect, it } from "vitest";

import { changeContentStatus, readStatusNote } from "./change-content-status";
import type {
  ContentStatusRecord,
  ContentStatusStore
} from "./change-content-status";
import type { ContentStatus } from "../content/content.types";

function memoryStore(
  rows: Record<string, ContentStatusRecord>
): ContentStatusStore & {
  saved: Array<{
    id: string;
    from: ContentStatus;
    status: ContentStatus;
  }>;
  notes: Array<string | null>;
} {
  const saved: Array<{
    id: string;
    from: ContentStatus;
    status: ContentStatus;
  }> = [];
  const notes: Array<string | null> = [];

  return {
    saved,
    notes,
    async find(id) {
      return rows[id] ?? null;
    },
    async save(id, from, status, publishedAt, _now, note) {
      const row = rows[id];

      if (!row || row.status !== from) return false;

      rows[id] = { status, publishedAt };
      saved.push({ id, from, status });
      notes.push(note);
      return true;
    }
  };
}

describe("Change content status", () => {
  it("publishes a draft once", async () => {
    const store = memoryStore({
      post: { status: "draft", publishedAt: null }
    });

    const result = await changeContentStatus(
      store,
      "post",
      "published",
      100
    );

    expect(result).toEqual({
      ok: true,
      id: "post",
      status: "published",
      publishedAt: 100
    });
    expect(store.saved).toEqual([
      { id: "post", from: "draft", status: "published" }
    ]);
  });

  it("archives a published post and keeps the publish time", async () => {
    const store = memoryStore({
      post: { status: "published", publishedAt: 100 }
    });

    const result = await changeContentStatus(
      store,
      "post",
      "archived",
      250
    );

    expect(result).toEqual({
      ok: true,
      id: "post",
      status: "archived",
      publishedAt: 100
    });
  });

  it("returns a published post to draft and keeps the publish time", async () => {
    const store = memoryStore({
      post: { status: "published", publishedAt: 100 }
    });

    const result = await changeContentStatus(
      store,
      "post",
      "draft",
      250
    );

    expect(result).toEqual({
      ok: true,
      id: "post",
      status: "draft",
      publishedAt: 100
    });
  });

  it("does not revive an archived post", async () => {
    const store = memoryStore({
      post: { status: "archived", publishedAt: 100 }
    });

    const result = await changeContentStatus(
      store,
      "post",
      "published",
      250
    );

    expect(result).toEqual({ ok: false, reason: "rejected" });
    expect(store.saved).toEqual([]);
  });

  it("reports a missing post", async () => {
    const store = memoryStore({});

    const result = await changeContentStatus(
      store,
      "missing",
      "published",
      100
    );

    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("keeps a note only when rejecting", async () => {
    const store = memoryStore({
      a: { status: "draft", publishedAt: null },
      b: { status: "draft", publishedAt: null }
    });

    await changeContentStatus(store, "a", "archived", 100, "Trùng bài cũ");
    await changeContentStatus(store, "b", "published", 100, "Bị bỏ qua");

    expect(store.notes).toEqual(["Trùng bài cũ", null]);
  });
});

describe("readStatusNote", () => {
  it("treats missing or blank notes as no note", () => {
    expect(readStatusNote(undefined)).toEqual({ ok: true, note: null });
    expect(readStatusNote(null)).toEqual({ ok: true, note: null });
    expect(readStatusNote("   ")).toEqual({ ok: true, note: null });
  });

  it("collapses whitespace", () => {
    expect(readStatusNote("  Nội dung\n\nchưa rõ  ")).toEqual({
      ok: true,
      note: "Nội dung chưa rõ"
    });
  });

  it("rejects long or non-text notes", () => {
    expect(readStatusNote("a".repeat(301))).toEqual({ ok: false });
    expect(readStatusNote(5)).toEqual({ ok: false });
  });
});
