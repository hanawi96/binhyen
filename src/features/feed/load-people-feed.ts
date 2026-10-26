import { ANONYMOUS_VIEWER, type FeedViewer } from "./d1-viewer-state";
import {
  CARD_COLUMNS,
  attachViewerReactions,
  mapRow,
  toContentItem,
  type ContentRow,
  type RankedContent
} from "./feed-rows";
import type { FeedNotice, ViewerFeedPage } from "./load-public-feed";
import {
  decodePeopleCursor,
  encodePeopleCursor,
  type PeopleCursor
} from "./people-cursor";
import { hasSeen } from "./seen-bits";

/** Tran so hang doc khi phai bo qua nhieu bai da xem. */
export const MAX_PEOPLE_SCAN_ROWS = 2000;
const BATCH_CAP = 200;

function markOf(row: ContentRow): PeopleCursor {
  return {
    publishedAt: Number(row.published_at) || 0,
    id: row.id
  };
}

/**
 * Muc "Nguoi khac": chi bai user da duyet, moi nhat truoc.
 * Bo bai da xem (bitmap chung voi Danh cho ban); het kho thi reset vong.
 */
export async function loadPeopleFeed(
  db: D1Database,
  input: {
    cursor: string | null;
    limit: number;
    viewer?: FeedViewer;
    onAllSeen?: () => Promise<Uint8Array>;
  }
): Promise<ViewerFeedPage> {
  const viewer = input.viewer ?? ANONYMOUS_VIEWER;
  const startCursor =
    input.cursor === null ? null : decodePeopleCursor(input.cursor);

  if (input.cursor !== null && !startCursor) {
    throw new Error("Invalid people cursor");
  }

  let seen = viewer.state?.seen ?? new Uint8Array(0);
  let notice: FeedNotice | null = null;

  const collect = async (
    from: PeopleCursor | null
  ): Promise<{
    items: RankedContent[];
    /** Vi tri sau the cuoi giu lai — dung lam nextCursor. */
    afterLast: PeopleCursor | null;
    pageStart: PeopleCursor | null;
    /** Doc het khoang (het bang hoac het limit scan). */
    exhausted: boolean;
  }> => {
    const items: RankedContent[] = [];
    let cursor = from;
    let pageStart: PeopleCursor | null = null;
    let afterLast: PeopleCursor | null = null;
    let scanned = 0;
    let batch = Math.min(Math.max(input.limit + 1, 8), BATCH_CAP);

    while (items.length < input.limit && scanned < MAX_PEOPLE_SCAN_ROWS) {
      const { results } = await db
        .prepare(
          `SELECT ${CARD_COLUMNS}
           FROM contents c
           WHERE c.status = 'published'
             AND c.published_at IS NOT NULL
             AND c.author_id IS NOT NULL
             AND (?1 IS NULL OR c.author_id <> ?1)
             AND (
               ?2 IS NULL
               OR c.published_at < ?2
               OR (c.published_at = ?2 AND c.id < ?3)
             )
           ORDER BY c.published_at DESC, c.id DESC
           LIMIT ?4`
        )
        .bind(
          viewer.userId,
          cursor?.publishedAt ?? null,
          cursor?.id ?? null,
          batch
        )
        .all<ContentRow>();

      scanned += results.length;

      if (results.length === 0) {
        return { items, afterLast, pageStart, exhausted: true };
      }

      for (const row of results) {
        const ranked = mapRow(row);
        cursor = markOf(row);

        if (hasSeen(seen, ranked.seq)) continue;

        if (!pageStart) pageStart = markOf(row);
        items.push(ranked);
        afterLast = markOf(row);

        if (items.length >= input.limit) break;
      }

      if (results.length < batch) {
        return { items, afterLast, pageStart, exhausted: true };
      }

      // Tiep tuc sau batch day du (ke ca khi da du limit — can probe hasMore).
      if (items.length >= input.limit) {
        return { items, afterLast, pageStart, exhausted: false };
      }

      batch = Math.min(batch * 2, BATCH_CAP);
    }

    return {
      items,
      afterLast,
      pageStart,
      exhausted: true
    };
  };

  let page = await collect(startCursor);

  // Het bai chua xem (trang dau hoac trang tiep) → reset vong, mo lai tu moi nhat.
  if (
    page.items.length === 0 &&
    page.exhausted &&
    input.onAllSeen &&
    (viewer.state?.seenCount ?? 0) > 0
  ) {
    seen = await input.onAllSeen();
    notice = "all-seen";
    page = await collect(null);
  }

  let nextCursor: string | null = null;
  let hasMore = false;

  if (page.afterLast && page.items.length > 0) {
    const { results: probe } = await db
      .prepare(
        `SELECT 1 AS ok
         FROM contents c
         WHERE c.status = 'published'
           AND c.published_at IS NOT NULL
           AND c.author_id IS NOT NULL
           AND (?1 IS NULL OR c.author_id <> ?1)
           AND (
             c.published_at < ?2
             OR (c.published_at = ?2 AND c.id < ?3)
           )
         LIMIT 1`
      )
      .bind(
        viewer.userId,
        page.afterLast.publishedAt,
        page.afterLast.id
      )
      .all<{ ok: number }>();

    if (probe.length > 0) {
      // Con hang sau the cuoi — tai tiep (bo seen) hoac cho lan sau reset vong.
      nextCursor = encodePeopleCursor(page.afterLast);
      hasMore = true;
    } else if (!notice && input.onAllSeen) {
      // Het bang theo thoi gian, chua reset trong request nay:
      // cho mot lan tai tiep → trang rong → all-seen noi vong.
      nextCursor = encodePeopleCursor(page.afterLast);
      hasMore = true;
    }
    // Da all-seen trong request nay va khong con hang → dung (tranh lap vo han).
  }

  const items = await attachViewerReactions(
    db,
    page.items.map(toContentItem),
    viewer.actorId
  );

  return {
    items,
    nextCursor,
    hasMore,
    matched: true,
    notice,
    pageCursor: page.pageStart
      ? encodePeopleCursor(page.pageStart)
      : nextCursor ?? "p1:1:_"
  };
}
