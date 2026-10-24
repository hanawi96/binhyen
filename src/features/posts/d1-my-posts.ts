import { isContentStatus } from "../admin/change-content-status";
import { isContentTheme } from "../content/content.types";
import { encodeMyCursor } from "../interactions/my-reactions";
import type { MyPostItem, MyPostStore } from "./my-posts";

interface ItemRow {
  id: string;
  title: string;
  category: string;
  description: string;
  theme: string;
  status: string;
  created_at: number;
  fresh: number;
  note: string | null;
}

/**
 * Ly do cua lan doi trang thai cuoi, chi khi bai dang bi tu choi.
 * Truy van dung no phai dat ten bang contents la c.
 */
export const REJECT_NOTE = `CASE WHEN c.status = 'archived' THEN (
    SELECT e.note FROM content_status_events e
    WHERE e.content_id = c.id
    ORDER BY e.id DESC
    LIMIT 1
  ) END`;

// Bai dang o trang thai da duyet / tu choi, va lan doi sang trang thai do
// xay ra sau lan cuoi nguoi viet xem "Da viet".
const FRESH = `c.status IN ('published', 'archived')
  AND EXISTS (
    SELECT 1 FROM content_status_events e
    WHERE e.content_id = c.id
      AND e.to_status = c.status
      AND e.created_at > u.posts_seen_at
  )`;

function toItem(row: ItemRow): MyPostItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    theme: isContentTheme(row.theme) ? row.theme : "peace",
    status: isContentStatus(row.status) ? row.status : "draft",
    createdAt: row.created_at,
    fresh: row.fresh === 1,
    note: row.note
  };
}

/** Moi trang thai: tac gia thay ca ban nhap lan bai da an. */
export function createD1MyPostStore(db: D1Database): MyPostStore {
  return {
    async page(userId, cursor, limit) {
      const { results } = await db
        .prepare(
          `SELECT c.id, c.title, c.category, c.description, c.theme, c.status,
                  c.created_at, (${FRESH}) AS fresh, ${REJECT_NOTE} AS note
           FROM contents c
           JOIN users u ON u.id = c.author_id
           WHERE c.author_id = ?1
             AND (
               ?2 IS NULL
               OR c.created_at < ?2
               OR (c.created_at = ?2 AND c.id < ?3)
             )
           ORDER BY c.created_at DESC, c.id DESC
           LIMIT ?4`
        )
        .bind(userId, cursor?.reactedAt ?? null, cursor?.id ?? null, limit + 1)
        .all<ItemRow>();

      const items = results.slice(0, limit).map(toItem);
      const last = items[items.length - 1];

      return {
        items,
        nextCursor:
          results.length > limit && last
            ? encodeMyCursor({ reactedAt: last.createdAt, id: last.id })
            : null
      };
    },

    async count(userId) {
      const row = await db
        .prepare(`SELECT COUNT(*) AS total FROM contents WHERE author_id = ?1`)
        .bind(userId)
        .first<{ total: number }>();

      return row?.total ?? 0;
    },

    async openDrafts(userId) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS total FROM contents
           WHERE author_id = ?1 AND status = 'draft'`
        )
        .bind(userId)
        .first<{ total: number }>();

      return row?.total ?? 0;
    },

    async news(userId) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS total
           FROM contents c
           JOIN users u ON u.id = c.author_id
           WHERE c.author_id = ?1 AND ${FRESH}`
        )
        .bind(userId)
        .first<{ total: number }>();

      return row?.total ?? 0;
    },

    async markSeen(userId, now) {
      await db
        .prepare(
          `UPDATE users SET posts_seen_at = MAX(posts_seen_at, ?2)
           WHERE id = ?1`
        )
        .bind(userId, now)
        .run();
    },

    async statusOf(userId, id) {
      const row = await db
        .prepare(
          `SELECT status FROM contents WHERE id = ?1 AND author_id = ?2`
        )
        .bind(id, userId)
        .first<{ status: string }>();

      return row && isContentStatus(row.status) ? row.status : null;
    },

    async withdraw(userId, id) {
      // Khoa ngoai ON DELETE CASCADE xoa luon chu de, noi dung va lich su.
      const result = await db
        .prepare(
          `DELETE FROM contents
           WHERE id = ?1 AND author_id = ?2 AND status = 'draft'`
        )
        .bind(id, userId)
        .run();

      // D1 dem ca cac dong xoa day chuyen vao changes.
      return (result.meta.changes ?? 0) > 0;
    }
  };
}
