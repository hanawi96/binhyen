import { CONTENT_ID_PATTERN } from "../admin/admin-http";
import type { ContentItem } from "../content/content.types";
import {
  CARD_COLUMNS,
  mapRow,
  toContentItem,
  type ContentRow
} from "./feed-rows";

/** Doc id tu query ?v= — chi nhan ma bai hop le. */
export function readFocusContentId(value: string | null): string | null {
  if (!value || !CONTENT_ID_PATTERN.test(value)) return null;
  return value;
}

/** Mot the da xuat ban theo id — dung de ghim dau trang chu (?v=). */
export async function loadPublishedCard(
  db: D1Database,
  id: string
): Promise<ContentItem | null> {
  if (!CONTENT_ID_PATTERN.test(id)) return null;

  const row = await db
    .prepare(
      `SELECT ${CARD_COLUMNS}
       FROM contents c
       WHERE c.id = ?1
         AND c.status = 'published'
       LIMIT 1`
    )
    .bind(id)
    .first<ContentRow>();

  if (!row) return null;
  return toContentItem(mapRow(row));
}

/** Dat the focus len dau, bo trung, cat theo gioi han trang. */
export function prependFocusCard(
  focus: ContentItem,
  items: readonly ContentItem[],
  limit: number
): ContentItem[] {
  return [focus, ...items.filter((item) => item.id !== focus.id)].slice(
    0,
    Math.max(1, limit)
  );
}
