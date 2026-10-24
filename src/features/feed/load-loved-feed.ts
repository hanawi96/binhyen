import {
  CARD_COLUMNS,
  mapRow,
  toContentItem,
  type ContentRow
} from "./feed-rows";
import type { PublicFeedPage } from "./load-public-feed";
import {
  decodeLovedCursor,
  encodeLovedCursor
} from "./loved-cursor";

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
      `SELECT ${CARD_COLUMNS}
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
    .all<ContentRow>();

  const rows = results.slice(0, input.limit);
  const last = rows[rows.length - 1];
  const nextCursor =
    results.length > input.limit && last
      ? encodeLovedCursor({
          likeCount: Number(last.like_count) || 0,
          id: last.id
        })
      : null;

  return {
    items: rows.map((row) => toContentItem(mapRow(row))),
    nextCursor,
    hasMore: nextCursor !== null,
    matched: true
  };
}
