import type { ContentItem } from "../content/content.types";

/**
 * Ket qua cua mot lan tai noi dung (API hoac nguon khac).
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
