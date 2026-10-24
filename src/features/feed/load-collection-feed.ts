import {
  decodeCollectionCursor,
  encodeCollectionCursor
} from "../collections/collection-cursor";
import { getCollectionBySlug } from "../collections/d1-collections";
import {
  CARD_COLUMNS,
  mapRow,
  toContentItem,
  type ContentRow
} from "./feed-rows";
import type { PublicFeedPage } from "./load-public-feed";

export interface CollectionFeedPage extends PublicFeedPage {
  collection: {
    id: string;
    slug: string;
    title: string;
    description: string;
    itemCount: number;
  };
}

interface CollectionContentRow extends ContentRow {
  member_sort: number;
}

/**
 * Feed bo suu tap: thu tu sort_order co dinh, chi bai published.
 * Khong dung ring / seen.
 */
export async function loadCollectionFeed(
  db: D1Database,
  input: { slug: string; cursor: string | null; limit: number }
): Promise<CollectionFeedPage | null> {
  const meta = await getCollectionBySlug(db, input.slug, {
    publicOnly: true
  });

  if (!meta) return null;

  const cursor =
    input.cursor === null ? null : decodeCollectionCursor(input.cursor);

  if (input.cursor !== null && !cursor) {
    throw new Error("Invalid collection cursor");
  }

  const { results } = await db
    .prepare(
      `SELECT ${CARD_COLUMNS},
              cc.sort_order AS member_sort
       FROM collection_contents cc
       JOIN contents c ON c.id = cc.content_id
       WHERE cc.collection_id = ?1
         AND c.status = 'published'
         AND c.published_at IS NOT NULL
         AND (
           ?2 IS NULL
           OR cc.sort_order > ?2
           OR (cc.sort_order = ?2 AND cc.content_id > ?3)
         )
       ORDER BY cc.sort_order ASC, cc.content_id ASC
       LIMIT ?4`
    )
    .bind(
      meta.id,
      cursor?.sortOrder ?? null,
      cursor?.id ?? null,
      input.limit + 1
    )
    .all<CollectionContentRow>();

  const rows = results.slice(0, input.limit);
  const last = rows[rows.length - 1];
  const nextCursor =
    results.length > input.limit && last
      ? encodeCollectionCursor({
          sortOrder: Number(last.member_sort) || 0,
          id: last.id
        })
      : null;

  return {
    collection: {
      id: meta.id,
      slug: meta.slug,
      title: meta.title,
      description: meta.description,
      itemCount: meta.itemCount
    },
    items: rows.map((row) => toContentItem(mapRow(row))),
    nextCursor,
    hasMore: nextCursor !== null,
    matched: true
  };
}
