import type {
  ReactionKind,
  ReactionState,
  ReactionStore
} from "./content-reactions";

interface StateRow {
  liked: number;
  saved: number;
  like_count: number;
  save_count: number;
  share_count: number;
}

const COUNT_COLUMN: Record<ReactionKind, "like_count" | "save_count"> = {
  like: "like_count",
  save: "save_count"
};

// Moi nguoi chi duoc tinh mot luot chia se cho moi bai trong 24 gio.
const SHARE_WINDOW_SECONDS = 60 * 60 * 24;

const PUBLISHED = `EXISTS (
  SELECT 1 FROM contents
  WHERE id = ?1 AND status = 'published'
)`;

function toState(row: StateRow | null | undefined): ReactionState | null {
  if (!row) return null;

  return {
    liked: row.liked === 1,
    saved: row.saved === 1,
    likeCount: row.like_count,
    saveCount: row.save_count,
    shareCount: row.share_count
  };
}

/**
 * Ghi luot, cap nhat so dem va doc lai trang thai trong mot batch.
 * changes() cua cau truoc quyet dinh co cong / tru so dem hay khong,
 * nen bam lap lai khong lam lech so.
 */
export function createD1ReactionStore(db: D1Database): ReactionStore {
  function readStatement(contentId: string, actorId: string | null) {
    return db
      .prepare(
        `SELECT
           EXISTS (
             SELECT 1 FROM content_reactions
             WHERE content_id = ?1 AND actor_id = ?2 AND kind = 'like'
           ) AS liked,
           EXISTS (
             SELECT 1 FROM content_reactions
             WHERE content_id = ?1 AND actor_id = ?2 AND kind = 'save'
           ) AS saved,
           COALESCE(s.like_count, 0) AS like_count,
           COALESCE(s.save_count, 0) AS save_count,
           COALESCE(s.share_count, 0) AS share_count
         FROM contents c
         LEFT JOIN content_stats s ON s.content_id = c.id
         WHERE c.id = ?1 AND c.status = 'published'`
      )
      .bind(contentId, actorId);
  }

  async function runWithState(
    writes: D1PreparedStatement[],
    contentId: string,
    actorId: string
  ): Promise<ReactionState | null> {
    const results = await db.batch<StateRow>([
      ...writes,
      readStatement(contentId, actorId)
    ]);

    return toState(results[results.length - 1]?.results[0]);
  }

  return {
    async read(contentId, actorId) {
      const row = await readStatement(contentId, actorId).first<StateRow>();
      return toState(row);
    },

    async react(contentId, actorId, kind, on, now) {
      const column = COUNT_COLUMN[kind];

      const writes = on
        ? [
            db
              .prepare(
                `INSERT INTO content_reactions
                   (content_id, actor_id, kind, created_at)
                 SELECT ?1, ?2, ?3, ?4
                 WHERE ${PUBLISHED}
                 ON CONFLICT DO NOTHING`
              )
              .bind(contentId, actorId, kind, now),
            db
              .prepare(
                `INSERT INTO content_stats
                   (content_id, ${column}, updated_at)
                 SELECT ?1, 1, ?2
                 WHERE changes() > 0
                 ON CONFLICT (content_id) DO UPDATE SET
                   ${column} = ${column} + 1,
                   updated_at = excluded.updated_at`
              )
              .bind(contentId, now)
          ]
        : [
            db
              .prepare(
                `DELETE FROM content_reactions
                 WHERE content_id = ?1 AND actor_id = ?2 AND kind = ?3`
              )
              .bind(contentId, actorId, kind),
            db
              .prepare(
                `UPDATE content_stats
                 SET ${column} = ${column} - 1,
                     updated_at = ?2
                 WHERE content_id = ?1
                   AND ${column} > 0
                   AND changes() > 0`
              )
              .bind(contentId, now)
          ];

      return runWithState(writes, contentId, actorId);
    },

    async share(contentId, actorId, channel, now) {
      return runWithState(
        [
          db
            .prepare(
              `INSERT INTO content_shares
                 (content_id, actor_id, channel, created_at)
               SELECT ?1, ?2, ?3, ?4
               WHERE ${PUBLISHED}
                 AND NOT EXISTS (
                   SELECT 1 FROM content_shares
                   WHERE content_id = ?1
                     AND actor_id = ?2
                     AND created_at > ?4 - ${SHARE_WINDOW_SECONDS}
                 )`
            )
            .bind(contentId, actorId, channel, now),
          db
            .prepare(
              `INSERT INTO content_stats
                 (content_id, share_count, updated_at)
               SELECT ?1, 1, ?2
               WHERE changes() > 0
               ON CONFLICT (content_id) DO UPDATE SET
                 share_count = share_count + 1,
                 updated_at = excluded.updated_at`
            )
            .bind(contentId, now)
        ],
        contentId,
        actorId
      );
    }
  };
}
