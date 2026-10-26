import { describe, expect, it, vi } from "vitest";

import { openTestDatabase } from "../../test/sqlite-d1";
import type { FeedViewer } from "./d1-viewer-state";
import { ANONYMOUS_VIEWER } from "./d1-viewer-state";
import { loadPeopleFeed } from "./load-people-feed";
import { decodePeopleCursor } from "./people-cursor";
import { markSeen } from "./seen-bits";

const AUTHOR_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const AUTHOR_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function setup() {
  const { db, sqlite } = openTestDatabase();

  sqlite
    .prepare(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES (?, 'a@b.vn', 'An', ?), (?, 'b@b.vn', 'Bình', ?)`
    )
    .run(AUTHOR_A, "x".repeat(40), AUTHOR_B, "x".repeat(40));

  const insert = sqlite.prepare(
    `INSERT INTO contents (
       id, slug, kind, status, category, title, theme,
       created_at, published_at, rank_key, author_id
     ) VALUES (?, ?, 'story', ?, 'test', ?, 'peace', ?, ?, ?, ?)`
  );

  insert.run("u1", "u1", "published", "Bài An 1", 100, 100, 10, AUTHOR_A);
  insert.run("u2", "u2", "published", "Bài Bình", 200, 200, 20, AUTHOR_B);
  insert.run("u3", "u3", "published", "Bài An 2", 300, 300, 30, AUTHOR_A);
  insert.run("admin", "admin", "published", "Bài admin", 400, 400, 40, null);
  insert.run("draft", "draft", "draft", "Nháp", 500, null, 50, AUTHOR_B);

  const seqs = new Map<string, number>();
  for (const row of sqlite
    .prepare(`SELECT id, seq FROM contents`)
    .all() as Array<{ id: string; seq: number }>) {
    seqs.set(row.id, row.seq);
  }

  return { db, sqlite, seqs };
}

function viewerWithSeen(
  seqs: number[],
  userId: string | null = null
): FeedViewer {
  const marked = markSeen(new Uint8Array(0), seqs);
  return {
    ...ANONYMOUS_VIEWER,
    userId,
    key: userId ? `u:${userId}` : "a:test",
    state: {
      key: userId ? `u:${userId}` : "a:test",
      seen: marked.bits,
      seenCount: marked.added,
      positions: new Map(),
      freshAt: 0,
      loopCount: 0,
      version: 1
    }
  };
}

describe("loadPeopleFeed", () => {
  it("chỉ bài user đã duyệt, mới nhất trước, kèm tên tác giả", async () => {
    const { db } = setup();
    const page = await loadPeopleFeed(db, {
      cursor: null,
      limit: 10
    });

    expect(page.items.map((item) => item.id)).toEqual(["u3", "u2", "u1"]);
    expect(page.items[0]?.authorName).toBe("An");
    expect(page.items[1]?.authorName).toBe("Bình");
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.notice).toBeNull();
  });

  it("ẩn bài của chính người xem", async () => {
    const { db } = setup();
    const page = await loadPeopleFeed(db, {
      cursor: null,
      limit: 10,
      viewer: { ...ANONYMOUS_VIEWER, userId: AUTHOR_A }
    });

    expect(page.items.map((item) => item.id)).toEqual(["u2"]);
  });

  it("phân trang theo published_at DESC", async () => {
    const { db } = setup();
    const first = await loadPeopleFeed(db, {
      cursor: null,
      limit: 2
    });

    expect(first.items.map((item) => item.id)).toEqual(["u3", "u2"]);
    expect(first.hasMore).toBe(true);
    expect(decodePeopleCursor(first.nextCursor ?? "")).toEqual({
      publishedAt: 200,
      id: "u2"
    });

    const second = await loadPeopleFeed(db, {
      cursor: first.nextCursor,
      limit: 2
    });

    expect(second.items.map((item) => item.id)).toEqual(["u1"]);
    expect(second.hasMore).toBe(false);
  });

  it("bỏ bài đã xem trên bitmap", async () => {
    const { db, seqs } = setup();
    const seen = [seqs.get("u3")!, seqs.get("u2")!];
    const page = await loadPeopleFeed(db, {
      cursor: null,
      limit: 10,
      viewer: viewerWithSeen(seen)
    });

    expect(page.items.map((item) => item.id)).toEqual(["u1"]);
    expect(page.notice).toBeNull();
  });

  it("hết bài chưa xem thì reset vòng và notice all-seen", async () => {
    const { db, seqs } = setup();
    const seen = [seqs.get("u1")!, seqs.get("u2")!, seqs.get("u3")!];
    const onAllSeen = vi.fn(async () => new Uint8Array(0));

    const page = await loadPeopleFeed(db, {
      cursor: null,
      limit: 10,
      viewer: viewerWithSeen(seen),
      onAllSeen
    });

    expect(onAllSeen).toHaveBeenCalledOnce();
    expect(page.notice).toBe("all-seen");
    expect(page.items.map((item) => item.id)).toEqual(["u3", "u2", "u1"]);
  });

  it("trang tiếp hết bài chưa xem cũng nối vòng (all-seen)", async () => {
    const { db, seqs } = setup();
    const seen = [seqs.get("u1")!, seqs.get("u2")!, seqs.get("u3")!];
    const onAllSeen = vi.fn(async () => new Uint8Array(0));

    const page = await loadPeopleFeed(db, {
      cursor: "p1:300:u3",
      limit: 10,
      viewer: viewerWithSeen(seen),
      onAllSeen
    });

    expect(onAllSeen).toHaveBeenCalledOnce();
    expect(page.notice).toBe("all-seen");
    expect(page.items.map((item) => item.id)).toEqual(["u3", "u2", "u1"]);
  });
});
