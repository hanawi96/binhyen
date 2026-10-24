import type { ActorStore } from "./actor";

interface ActorRow {
  last_seen_at: number;
}

export function createD1ActorStore(db: D1Database): ActorStore {
  return {
    async find(id) {
      const row = await db
        .prepare(
          `SELECT last_seen_at
           FROM actors
           WHERE id = ?1`
        )
        .bind(id)
        .first<ActorRow>();

      return row ? { lastSeenAt: row.last_seen_at } : null;
    },

    async create(id, now) {
      await db
        .prepare(
          `INSERT INTO actors (id, created_at, last_seen_at)
           VALUES (?1, ?2, ?2)`
        )
        .bind(id, now)
        .run();
    },

    async touch(id, now) {
      await db
        .prepare(
          `UPDATE actors
           SET last_seen_at = ?2
           WHERE id = ?1`
        )
        .bind(id, now)
        .run();
    }
  };
}
