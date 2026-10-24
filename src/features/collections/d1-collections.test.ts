import { describe, expect, it } from "vitest";

import { openTestDatabase } from "../../test/sqlite-d1";
import {
  createCollection,
  deleteCollection,
  getCollectionBySlug,
  listCollectionsPublic,
  normalizeCollectionSlug,
  normalizeCollectionTitle,
  parseCollectionDraft,
  setCollectionItems,
  updateCollection
} from "./d1-collections";
import {
  decodeCollectionCursor,
  encodeCollectionCursor
} from "./collection-cursor";

describe("collection validators", () => {
  it("chuẩn hóa title và slug", () => {
    expect(normalizeCollectionTitle("  100 câu động lực  ")).toBe(
      "100 câu động lực"
    );
    expect(normalizeCollectionTitle("")).toBeNull();
    expect(normalizeCollectionSlug("100-cau-dong-luc")).toBe(
      "100-cau-dong-luc"
    );
    expect(normalizeCollectionSlug("Ánh sáng!")).toBe("anh-sang");
    expect(normalizeCollectionSlug("---")).toBeNull();
  });

  it("parse draft và cursor", () => {
    const draft = parseCollectionDraft({
      title: "Bình yên mỗi ngày",
      description: "Những câu dịu dàng.",
      status: "published",
      sortOrder: 2
    });
    expect(draft.ok).toBe(true);
    if (draft.ok) {
      expect(draft.value.slug).toBe("binh-yen-moi-ngay");
      expect(draft.value.status).toBe("published");
      expect(draft.value.coverUrl).toBe("");
      expect(draft.value.coverAlt).toBe("");
    }

    const withCover = parseCollectionDraft({
      title: "Có ảnh",
      coverUrl: "/api/media/image/2026/10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg",
      coverAlt: "Bìa xanh"
    });
    expect(withCover.ok).toBe(true);
    if (withCover.ok) {
      expect(withCover.value.coverUrl).toContain("/api/media/image/");
      expect(withCover.value.coverAlt).toBe("Bìa xanh");
    }

    const cursor = { sortOrder: 3, id: "c01" };
    expect(decodeCollectionCursor(encodeCollectionCursor(cursor))).toEqual(
      cursor
    );
  });
});

describe("d1 collections store", () => {
  it("CRUD + membership + archive khi còn bài", async () => {
    const { db, sqlite } = openTestDatabase();
    const now = 1_700_000_000;

    sqlite
      .prepare(
        `INSERT INTO contents (
           id, slug, kind, status, category, title, theme,
           created_at, published_at, rank_key
         ) VALUES
           ('c111111111111111', 'a', 'quote', 'published', 't', 'A', 'peace', ?, ?, 1),
           ('c222222222222222', 'b', 'quote', 'published', 't', 'B', 'peace', ?, ?, 2),
           ('c333333333333333', 'c', 'quote', 'draft', 't', 'C', 'peace', ?, NULL, 3)`
      )
      .run(now, now, now, now, now);

    const created = await createCollection(
      db,
      {
        title: "100 câu động lực",
        slug: "100-cau-dong-luc",
        description: "Thắp lửa nhẹ nhàng.",
        coverUrl: "",
        coverAlt: "",
        status: "published",
        sortOrder: 0
      },
      now
    );

    expect(created.slug).toBe("100-cau-dong-luc");
    expect(created.publishedAt).toBe(now);

    const withItems = await setCollectionItems(
      db,
      created.id,
      ["c222222222222222", "c111111111111111", "c333333333333333"],
      now + 1
    );

    expect(withItems.items.map((item) => item.contentId)).toEqual([
      "c222222222222222",
      "c111111111111111",
      "c333333333333333"
    ]);
    expect(withItems.publishedCount).toBe(2);

    const publicList = await listCollectionsPublic(db);
    expect(publicList).toHaveLength(1);
    expect(publicList[0]?.publishedCount).toBe(2);
    expect(publicList[0]?.itemCount).toBe(2);

    const bySlug = await getCollectionBySlug(db, "100-cau-dong-luc", {
      publicOnly: true
    });
    expect(bySlug?.title).toBe("100 câu động lực");
    expect(bySlug?.itemCount).toBe(2);

    await updateCollection(
      db,
      created.id,
      {
        title: "100 câu động lực",
        slug: "100-cau-dong-luc",
        description: "Cập nhật.",
        coverUrl: "",
        coverAlt: "",
        status: "draft",
        sortOrder: 1
      },
      now + 2
    );

    expect(await listCollectionsPublic(db)).toHaveLength(0);

    const archived = await deleteCollection(db, created.id, now + 3);
    expect(archived).toEqual({ archived: true });

    const empty = await createCollection(
      db,
      {
        title: "Rỗng",
        slug: "rong",
        description: "",
        coverUrl: "",
        coverAlt: "",
        status: "draft",
        sortOrder: 9
      },
      now + 4
    );
    const removed = await deleteCollection(db, empty.id, now + 5);
    expect(removed).toEqual({ archived: false });
    expect(await getCollectionBySlug(db, "rong")).toBeNull();
  });
});
