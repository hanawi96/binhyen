import { describe, expect, it } from "vitest";

import { createD1AccountStore } from "../account/d1-account-store";
import { openTestDatabase } from "../../test/sqlite-d1";
import { createD1MyReactionStore } from "./d1-my-reactions";
import {
  adjustActorCountsForContent,
  countPublishedReactions
} from "./actor-reaction-counts";

const ACTOR = "AaAaAaAaAaAaAaAaAaAaAa";
const PRIMARY = "BbBbBbBbBbBbBbBbBbBbBb";
const ANON = "CcCcCcCcCcCcCcCcCcCcCc";

describe("actor-reaction-counts", () => {
  it("dem chi reaction gan bai published; leave/enter dong bo bang dem", async () => {
    const { db, sqlite } = openTestDatabase();
    const now = 1_700_000_000;

    sqlite
      .prepare(
        `INSERT INTO contents (
           id, slug, kind, status, category, title, theme, published_at, rank_key
         ) VALUES (?, 'q1', 'story', 'published', 'X', 'Mot', 'peace', ?, 1)`
      )
      .run("c1", now);

    sqlite.prepare(`INSERT INTO actors (id) VALUES (?)`).run(ACTOR);
    sqlite
      .prepare(
        `INSERT INTO content_reactions (content_id, actor_id, kind, created_at)
         VALUES ('c1', ?, 'like', ?), ('c1', ?, 'save', ?)`
      )
      .run(ACTOR, now, ACTOR, now);
    sqlite
      .prepare(
        `INSERT INTO actor_reaction_counts
           (actor_id, liked_count, saved_count, updated_at)
         VALUES (?, 1, 1, ?)`
      )
      .run(ACTOR, now);

    expect(await countPublishedReactions(db, ACTOR)).toEqual({
      liked: 1,
      saved: 1
    });

    await adjustActorCountsForContent(db, "c1", "leave");
    expect(
      sqlite
        .prepare(
          `SELECT liked_count, saved_count FROM actor_reaction_counts WHERE actor_id = ?`
        )
        .get(ACTOR)
    ).toMatchObject({ liked_count: 0, saved_count: 0 });

    sqlite
      .prepare(`UPDATE contents SET status = 'draft' WHERE id = 'c1'`)
      .run();
    expect(await countPublishedReactions(db, ACTOR)).toEqual({
      liked: 0,
      saved: 0
    });

    sqlite
      .prepare(`UPDATE contents SET status = 'published' WHERE id = 'c1'`)
      .run();
    await adjustActorCountsForContent(db, "c1", "enter");
    expect(await countPublishedReactions(db, ACTOR)).toEqual({
      liked: 1,
      saved: 1
    });
  });

  it("mergeActor chuyen reaction va dong bo dem Cua toi", async () => {
    const { db, sqlite } = openTestDatabase();
    const now = 1_700_000_100;
    const mine = createD1MyReactionStore(db);

    for (const [id, slug] of [
      ["c1", "q1"],
      ["c2", "q2"],
      ["c3", "q3"]
    ] as const) {
      sqlite
        .prepare(
          `INSERT INTO contents (
             id, slug, kind, status, category, title, theme, published_at, rank_key
           ) VALUES (?, ?, 'story', 'published', 'X', ?, 'peace', ?, 1)`
        )
        .run(id, slug, id, now);
    }

    sqlite
      .prepare(`INSERT INTO actors (id, user_id, created_at) VALUES (?, 'u1', ?)`)
      .run(PRIMARY, now);
    sqlite.prepare(`INSERT INTO actors (id) VALUES (?)`).run(ANON);

    sqlite
      .prepare(
        `INSERT INTO content_reactions (content_id, actor_id, kind, created_at)
         VALUES ('c1', ?, 'like', ?)`
      )
      .run(PRIMARY, now);
    sqlite
      .prepare(
        `INSERT INTO content_reactions (content_id, actor_id, kind, created_at)
         VALUES ('c2', ?, 'like', ?), ('c3', ?, 'like', ?)`
      )
      .run(ANON, now + 1, ANON, now + 2);

    sqlite
      .prepare(
        `INSERT INTO actor_reaction_counts
           (actor_id, liked_count, saved_count, updated_at)
         VALUES (?, 2, 0, ?), (?, 1, 0, ?)`
      )
      .run(ANON, now, PRIMARY, now);

    // Truoc fix: list = 3, badge van = 1 (dem ma chinh chua rebuild).
    expect(await mine.counts(PRIMARY)).toEqual({ liked: 1, saved: 0 });

    await createD1AccountStore(db).mergeActor(ANON, PRIMARY, now + 3);

    const page = await mine.page(PRIMARY, "like", null, 20);
    const counts = await mine.counts(PRIMARY);
    expect(page.items.map((item) => item.id).sort()).toEqual([
      "c1",
      "c2",
      "c3"
    ]);
    expect(counts).toEqual({ liked: 3, saved: 0 });
    expect(
      sqlite
        .prepare(
          `SELECT liked_count FROM actor_reaction_counts WHERE actor_id = ?`
        )
        .get(PRIMARY)
    ).toMatchObject({ liked_count: 3 });
    expect(
      sqlite
        .prepare(
          `SELECT 1 AS n FROM actor_reaction_counts WHERE actor_id = ?`
        )
        .get(ANON)
    ).toBeFalsy();
  });
});

