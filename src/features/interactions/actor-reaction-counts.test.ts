import { describe, expect, it } from "vitest";

import { openTestDatabase } from "../../test/sqlite-d1";
import {
  adjustActorCountsForContent,
  countPublishedReactions
} from "./actor-reaction-counts";

const ACTOR = "AaAaAaAaAaAaAaAaAaAaAa";

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
});

