import {
  mapRow,
  toContentItem,
  type ContentRow,
  type PublicFeedPage
} from "./load-public-feed";
import {
  decodeLovedCursor,
  encodeLovedCursor
} from "./loved-cursor";

interface LovedRow extends ContentRow {
  like_count: number;
}

/**
 * Muc "Yeu thich nhat": chi bai co it nhat mot luot thich.
 * CROSS JOIN giu content_stats o vong ngoai de SQLite di theo
 * idx_content_stats_likes va dung som o LIMIT, khong sap xep ca bang.
 */
export async function loadLovedFeed(
  db: D1Database,
  input: { cursor: string | null; limit: number }
): Promise<PublicFeedPage> {
  const cursor =
    input.cursor === null ? null : decodeLovedCursor(input.cursor);

  if (input.cursor !== null && !cursor) {
    throw new Error("Invalid loved cursor");
  }

  const { results } = await db
    .prepare(
      `SELECT
         c.id,
         c.slug,
         c.kind,
         c.status,
         c.category,
         c.title,
         c.description,
         c.tag,
         c.theme,
         c.published_at,
         (
           SELECT json_group_array(ct.topic_slug)
           FROM content_topics ct
           WHERE ct.content_id = c.id
         ) AS topics_json,
         (
           SELECT json_group_array(cm.mood_slug)
           FROM content_moods cm
           WHERE cm.content_id = c.id
         ) AS moods_json,
         s.like_count
       FROM content_stats s
       CROSS JOIN contents c ON c.id = s.content_id
       WHERE s.like_count > 0
         AND c.status = 'published'
         AND c.published_at IS NOT NULL
         AND (
           ?1 IS NULL
           OR s.like_count < ?1
           OR (s.like_count = ?1 AND s.content_id < ?2)
         )
       ORDER BY s.like_count DESC, s.content_id DESC
       LIMIT ?3`
    )
    .bind(cursor?.likeCount ?? null, cursor?.id ?? null, input.limit + 1)
    .all<LovedRow>();

  const rows = results.slice(0, input.limit);
  const last = rows[rows.length - 1];
  const nextCursor =
    results.length > input.limit && last
      ? encodeLovedCursor({ likeCount: last.like_count, id: last.id })
      : null;

  return {
    items: rows.map((row) => toContentItem(mapRow(row))),
    nextCursor,
    hasMore: nextCursor !== null,
    matched: true
  };
}
