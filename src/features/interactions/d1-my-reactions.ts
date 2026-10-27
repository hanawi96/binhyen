import { isContentTheme } from "../content/content.types";
import { countPublishedReactions } from "./actor-reaction-counts";
import {
  encodeMyCursor,
  type MyReactionCounts,
  type MyReactionItem,
  type MyReactionStore
} from "./my-reactions";

interface ItemRow {
  id: string;
  title: string;
  category: string;
  description: string;
  theme: string;
  reacted_at: number;
}

function toItem(row: ItemRow): MyReactionItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    theme: isContentTheme(row.theme) ? row.theme : "peace",
    reactedAt: row.reacted_at
  };
}

/** Chi bai con xuat ban; bai bi go van giu dong reaction nhung an khoi danh sach. */
export function createD1MyReactionStore(db: D1Database): MyReactionStore {
  return {
    async page(actorId, kind, cursor, limit) {
      const { results } = await db
        .prepare(
          `SELECT
             c.id,
             c.title,
             c.category,
             c.description,
             c.theme,
             r.created_at AS reacted_at
           FROM content_reactions r
           JOIN contents c
             ON c.id = r.content_id AND c.status = 'published'
           WHERE r.actor_id = ?1
             AND r.kind = ?2
             AND (
               ?3 IS NULL
               OR r.created_at < ?3
               OR (r.created_at = ?3 AND r.content_id < ?4)
             )
           ORDER BY r.created_at DESC, r.content_id DESC
           LIMIT ?5`
        )
        .bind(
          actorId,
          kind,
          cursor?.reactedAt ?? null,
          cursor?.id ?? null,
          limit + 1
        )
        .all<ItemRow>();

      const items = results.slice(0, limit).map(toItem);
      const last = items[items.length - 1];

      return {
        items,
        nextCursor:
          results.length > limit && last
            ? encodeMyCursor({ reactedAt: last.reactedAt, id: last.id })
            : null
      };
    },

    async counts(actorId): Promise<MyReactionCounts> {
      // Dem truc tiep tu danh sach published — khong lech sau mergeActor.
      return countPublishedReactions(db, actorId);
    }
  };
}
