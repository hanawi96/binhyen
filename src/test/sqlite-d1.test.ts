import { describe, expect, it } from "vitest";

import { openTestDatabase } from "./sqlite-d1";

describe("D1 giả trên SQLite", () => {
  it("áp đủ migration, trigger gán seq và rank_key cho bài mới", async () => {
    const { db } = openTestDatabase();

    await db
      .prepare(
        `INSERT INTO contents (id, slug, kind, category, title, theme)
         VALUES (?1, ?1, 'quote', 'test', 't', 'peace')`
      )
      .bind("a1")
      .run();

    const row = await db
      .prepare(`SELECT seq, rank_key FROM contents WHERE id = ?1`)
      .bind("a1")
      .first<{ seq: number; rank_key: number }>();

    expect(row?.seq).toBe(1);
    expect(typeof row?.rank_key).toBe("number");
  });

  it("BLOB trả về dạng mảng số như D1", async () => {
    const { db } = openTestDatabase();

    await db
      .prepare(
        `INSERT INTO viewer_feed_state (viewer_key, seen_bits, fresh_at)
         VALUES (?1, ?2, 0)`
      )
      .bind("a:AbCdEfGhIjKlMnOpQrStUv", Uint8Array.from([3, 4]).buffer)
      .run();

    const bits = await db
      .prepare(`SELECT seen_bits FROM viewer_feed_state`)
      .first("seen_bits");

    expect(bits).toEqual([3, 4]);
  });
});
