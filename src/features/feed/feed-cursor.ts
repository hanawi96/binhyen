import {
  isMoodFilter,
  isTopicFilter,
  type MoodFilter,
  type TopicFilter
} from "../content/filter-contents";

/**
 * Khoa sap xep cua feed cong khai.
 * Thu tu: published_at giam dan, sau do id giam dan.
 * Topic va mood gan cursor voi dung bo loc da tao ra no.
 */
export interface FeedCursorKey {
  publishedAt: number;
  id: string;
  topic: TopicFilter;
  mood: MoodFilter;
}

const CURSOR_VERSION = "v3";
const MAX_CURSOR_LENGTH = 2048;
const MAX_ID_LENGTH = 128;

/**
 * Cursor khong trong suot.
 * v3 dung published_at, id va bo loc topic/mood.
 */
export function encodeFeedCursor(key: FeedCursorKey): string {
  if (
    !Number.isSafeInteger(key.publishedAt) ||
    key.publishedAt < 0 ||
    key.id.length === 0 ||
    key.id.length > MAX_ID_LENGTH ||
    !isTopicFilter(key.topic) ||
    !isMoodFilter(key.mood)
  ) {
    throw new Error("Invalid feed cursor key");
  }

  return [
    CURSOR_VERSION,
    key.publishedAt,
    encodeURIComponent(key.id),
    key.topic,
    key.mood
  ].join(":");
}

export function decodeFeedCursor(
  value: string
): FeedCursorKey | null {
  if (
    value.length === 0 ||
    value.length > MAX_CURSOR_LENGTH
  ) {
    return null;
  }

  const match = /^v3:(\d+):([^:]*):([a-z]+):([a-z]+)$/.exec(
    value
  );

  if (!match) return null;

  const publishedAt = Number(match[1]);
  const topic = match[3];
  const mood = match[4];

  if (
    !Number.isSafeInteger(publishedAt) ||
    !topic ||
    !mood ||
    !isTopicFilter(topic) ||
    !isMoodFilter(mood)
  ) {
    return null;
  }

  try {
    const id = decodeURIComponent(match[2] ?? "");

    if (id.length === 0 || id.length > MAX_ID_LENGTH) {
      return null;
    }

    return { publishedAt, id, topic, mood };
  } catch {
    return null;
  }
}

/**
 * Dong nay dung sau cursor trong thu tu feed.
 * Phai trung voi dieu kien trong GET /api/feed:
 * published_at nho hon, hoac bang nhau va id nho hon.
 */
export function isAfterFeedCursor(
  row: FeedCursorKey,
  cursor: FeedCursorKey
): boolean {
  return (
    row.publishedAt < cursor.publishedAt ||
    (
      row.publishedAt === cursor.publishedAt &&
      row.id < cursor.id
    )
  );
}
