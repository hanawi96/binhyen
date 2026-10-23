import type { ContentStatus } from "../content/content.types";
import { isContentStatus } from "./change-content-status";
import type {
  ContentStatusRecord,
  ContentStatusStore
} from "./change-content-status";

interface StatusRow {
  status: string;
  published_at: number | null;
}

export function createD1ContentStatusStore(
  db: D1Database
): ContentStatusStore {
  return {
    async find(id) {
      const row = await db
        .prepare(
          `SELECT status, published_at
           FROM contents
           WHERE id = ?1`
        )
        .bind(id)
        .first<StatusRow>();

      if (!row || !isContentStatus(row.status)) return null;

      return {
        status: row.status,
        publishedAt: row.published_at
      };
    },

    async save(id, from, status, publishedAt, now) {
      const updated = await db
        .prepare(
          `UPDATE contents
           SET status = ?1,
               published_at = ?2,
               updated_at = ?3
           WHERE id = ?4
             AND status = ?5`
        )
        .bind(status, publishedAt, now, id, from)
        .run();

      if ((updated.meta.changes ?? 0) !== 1) return false;

      await db
        .prepare(
          `INSERT INTO content_status_events (
             content_id,
             from_status,
             to_status,
             created_at
           )
           VALUES (?1, ?2, ?3, ?4)`
        )
        .bind(id, from, status, now)
        .run();

      return true;
    }
  };
}

export type { ContentStatus, ContentStatusRecord };
