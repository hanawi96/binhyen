
import { demoContents } from "../content/demo-contents";
import { recommendContents } from "../content/recommend-contents";

import type { ContentItem } from "../content/content.types";
import type {
  TopicFilter,
  MoodFilter
} from "../content/filter-contents";

/**
 * Ket qua cua mot lan tai noi dung.
 */
export interface FeedPage {
  items: ContentItem[];
  nextCursor: string | null;
  matched?: boolean;
  /** Cursor bat dau trang nay; client gui kem khi bao da xem. */
  pageCursor?: string | null;
  /** "all-seen": vua xem het kho, feed bat dau vong moi. */
  notice?: "all-seen" | null;
}

/**
 * Tao nguon du lieu demo theo mot bo loc.
 *
 * Danh sach duoc co dinh cho tung luot kham pha.
 * Moi lan tai chi lay mot phan cua danh sach.
 */
export function createDemoFeedSource(
  topic: TopicFilter,
  mood: MoodFilter,
  excludedIds: ReadonlySet<string>
) {
  const candidates = demoContents.filter(
    (item) => !excludedIds.has(item.id)
  );

  const ordered = recommendContents(
    candidates,
    topic,
    mood,
    candidates.length
  );

  function getPage(
    cursor: string | null,
    requestedSize: number
  ): FeedPage {
    const start = cursor === null ? 0 : Number(cursor);

    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start > ordered.length
    ) {
      throw new Error("Invalid feed cursor");
    }

    const size = Number.isFinite(requestedSize)
      ? Math.max(1, Math.min(20, Math.floor(requestedSize)))
      : 3;

    const end = Math.min(start + size, ordered.length);

    return {
      items: ordered.slice(start, end),
      nextCursor:
        end < ordered.length ? String(end) : null
    };
  }

  return {
    // Lay trang dau dong bo de hien thi ngay.
    firstPage(pageSize: number): FeedPage {
      return getPage(null, pageSize);
    },

    // Giao dien async, de thay bang API sau nay.
    async loadPage(
      cursor: string,
      pageSize: number
    ): Promise<FeedPage> {
      return getPage(cursor, pageSize);
    }
  };
}
