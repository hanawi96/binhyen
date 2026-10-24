import {
  isMoodFilter,
  isTopicFilter,
  type MoodFilter,
  type TopicFilter
} from "../content/filter-contents";

/**
 * Vi tri dang dung tren vong cho tung bo loc, luu o
 * viewer_feed_state.positions_json. Bo loc dung gan nhat nam cuoi;
 * day thi bo cai lau nhat.
 */
export const MAX_POSITIONS = 6;
/** Khop CHECK length(positions_json) <= 4096 trong migration. */
export const MAX_POSITIONS_LENGTH = 4096;

const MAX_CURSOR_LENGTH = 1024;

export type Positions = ReadonlyMap<string, string>;

export function contextKey(topic: TopicFilter, mood: MoodFilter): string {
  return `${topic}:${mood}`;
}

function isContextKey(value: string): boolean {
  const [topic, mood, extra] = value.split(":");

  return (
    extra === undefined &&
    topic !== undefined &&
    mood !== undefined &&
    isTopicFilter(topic) &&
    isMoodFilter(mood)
  );
}

function isCursorValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CURSOR_LENGTH
  );
}

/** JSON hong hoac muc la thi bo qua, feed bat dau lai o muc do. */
export function parsePositions(raw: string | null): Map<string, string> {
  const positions = new Map<string, string>();

  if (raw === null) return positions;

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return positions;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return positions;
  }

  for (const [key, cursor] of Object.entries(value)) {
    if (isContextKey(key) && isCursorValue(cursor)) {
      positions.set(key, cursor);
    }
  }

  return trimPositions(positions);
}

export function serializePositions(positions: Positions): string {
  return JSON.stringify(Object.fromEntries(positions));
}

function trimPositions(positions: Map<string, string>): Map<string, string> {
  while (
    positions.size > MAX_POSITIONS ||
    (positions.size > 0 &&
      serializePositions(positions).length > MAX_POSITIONS_LENGTH)
  ) {
    const oldest = positions.keys().next().value;

    if (oldest === undefined) break;

    positions.delete(oldest);
  }

  return positions;
}

export function readPosition(
  positions: Positions,
  topic: TopicFilter,
  mood: MoodFilter
): string | null {
  return positions.get(contextKey(topic, mood)) ?? null;
}

/** Tra ban moi; bo loc vua ghi duoc dua xuong cuoi (moi nhat). */
export function writePosition(
  positions: Positions,
  topic: TopicFilter,
  mood: MoodFilter,
  cursor: string
): Map<string, string> {
  const key = contextKey(topic, mood);
  const next = new Map(positions);

  next.delete(key);

  if (isCursorValue(cursor)) next.set(key, cursor);

  return trimPositions(next);
}

/**
 * Gop vi tri khi dang nhap: tai khoan lam nen, an danh de len (thiet bi
 * vua xem). Bo loc trung thi lay ban an danh; day thi bo muc cu nhat.
 */
export function mergePositions(
  into: Positions,
  from: Positions
): Map<string, string> {
  const next = new Map(into);

  for (const [key, cursor] of from) {
    next.delete(key);
    next.set(key, cursor);
  }

  return trimPositions(next);
}
