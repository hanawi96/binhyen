import { describe, expect, it } from "vitest";

import { openTestDatabase } from "../../test/sqlite-d1";
import {
  createCollection,
  setCollectionItems
} from "../collections/d1-collections";
import { loadCollectionFeed } from "./load-collection-feed";

describe("loadCollectionFeed", () => {
  it("trả bài theo sort_order, chỉ published", async () => {
    const { db, sqlite } = openTestDatabase();
    const now = 1_700_000_100;

    sqlite
      .prepare(
        `INSERT INTO contents (
           id, slug, kind, status, category, title, theme,
           created_at, published_at, rank_key
         ) VALUES
           ('c111111111111111', 'a', 'quote', 'published', 't', 'Một', 'peace', ?, ?, 1),
           ('c222222222222222', 'b', 'quote', 'published', 't', 'Hai', 'peace', ?, ?, 2),
           ('c333333333333333', 'c', 'quote', 'draft', 't', 'Ba', 'peace', ?, NULL, 3)`
      )
      .run(now, now, now, now, now);

    const collection = await createCollection(
      db,
      {
        title: "Thử nghiệm",
        slug: "thu-nghiem",
        description: "Mở đầu.",
        status: "published",
        sortOrder: 0
      },
      now
    );

    await setCollectionItems(
      db,
      collection.id,
      ["c222222222222222", "c111111111111111", "c333333333333333"],
      now
    );

    const page = await loadCollectionFeed(db, {
      slug: "thu-nghiem",
      cursor: null,
      limit: 1
    });

    expect(page?.collection.itemCount).toBe(2);
    expect(page?.items.map((item) => item.id)).toEqual(["c222222222222222"]);
    expect(page?.hasMore).toBe(true);

    const next = await loadCollectionFeed(db, {
      slug: "thu-nghiem",
      cursor: page?.nextCursor ?? null,
      limit: 5
    });

    expect(next?.items.map((item) => item.id)).toEqual(["c111111111111111"]);
    expect(next?.hasMore).toBe(false);
  });
});
