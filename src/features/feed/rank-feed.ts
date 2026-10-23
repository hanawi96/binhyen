import {
  isContentKind,
  isContentTheme,
  type ContentKind,
  type ContentTheme
} from "../content/content.types";
import {
  isMoodFilter,
  isTopicFilter,
  type MoodFilter,
  type TopicFilter
} from "../content/filter-contents";
import {
  FEED_MIX_PATTERN,
  type FeedBucket
} from "../content/recommend-contents";

export interface Rankable {
  id: string;
  theme: string;
  kind: string;
  publishedAt: number;
}

export interface StreamMark {
  mode: "start" | "after" | "done";
  publishedAt: number;
  id: string;
}

export interface RankCursor {
  topic: TopicFilter;
  mood: MoodFilter;
  emitted: number;
  lastTheme: ContentTheme | null;
  lastKind: ContentKind | null;
  preferred: StreamMark;
  related: StreamMark;
  surprise: StreamMark;
}

export interface RankStream<T> {
  items: T[];
  complete: boolean;
}

const FALLBACK: readonly FeedBucket[] = [
  "preferred",
  "related",
  "surprise"
];

function startMark(): StreamMark {
  return { mode: "start", publishedAt: 0, id: "" };
}

export function hasDirectMatch(
  preferred: StreamMark,
  preferredCount: number
): boolean {
  if (preferred.mode === "after") return true;
  return preferredCount > 0;
}

export function startRankCursor(
  topic: TopicFilter,
  mood: MoodFilter
): RankCursor {
  return {
    topic,
    mood,
    emitted: 0,
    lastTheme: null,
    lastKind: null,
    preferred: startMark(),
    related: startMark(),
    surprise: startMark()
  };
}

function repeatsPrevious(
  item: Rankable,
  theme: ContentTheme | null,
  kind: ContentKind | null
): boolean {
  if (theme === null || kind === null) return false;

  return item.theme === theme || item.kind === kind;
}

function nextMark<T extends Rankable>(
  page: RankStream<T>,
  used: number,
  previous: StreamMark
): StreamMark {
  if (page.complete && used >= page.items.length) {
    return { mode: "done", publishedAt: 0, id: "" };
  }

  if (used === 0) return previous;

  const last = page.items[used - 1];

  if (!last) return previous;

  return {
    mode: "after",
    publishedAt: last.publishedAt,
    id: last.id
  };
}

/**
 * Ghep mot trang tu ba dong da sap published_at DESC, id DESC.
 * Khong bo qua bai chua lay. Het nhom uu tien thi dung nhom khac.
 */
export function assembleRankedPage<T extends Rankable>(
  streams: Record<FeedBucket, RankStream<T>>,
  state: RankCursor,
  limit: number
): {
  items: T[];
  cursor: RankCursor;
  hasMore: boolean;
} {
  const used: Record<FeedBucket, number> = {
    preferred: 0,
    related: 0,
    surprise: 0
  };

  const items: T[] = [];
  let emitted = state.emitted;
  let lastTheme = state.lastTheme;
  let lastKind = state.lastKind;

  while (items.length < limit) {
    const wanted =
      FEED_MIX_PATTERN[emitted % FEED_MIX_PATTERN.length] ??
      "preferred";

    const order = [wanted, ...FALLBACK];
    const seen = new Set<FeedBucket>();
    let first: FeedBucket | null = null;
    let chosen: FeedBucket | null = null;

    for (const bucket of order) {
      if (seen.has(bucket)) continue;

      seen.add(bucket);

      const head = streams[bucket].items[used[bucket]];

      if (!head) continue;

      if (!first) first = bucket;

      if (!repeatsPrevious(head, lastTheme, lastKind)) {
        chosen = bucket;
        break;
      }
    }

    const bucket = chosen ?? first;

    if (!bucket) break;

    const item = streams[bucket].items[used[bucket]];

    if (!item) break;

    used[bucket] += 1;
    items.push(item);
    emitted += 1;

    if (isContentTheme(item.theme)) lastTheme = item.theme;
    if (isContentKind(item.kind)) lastKind = item.kind;
  }

  const cursor: RankCursor = {
    topic: state.topic,
    mood: state.mood,
    emitted,
    lastTheme,
    lastKind,
    preferred: nextMark(
      streams.preferred,
      used.preferred,
      state.preferred
    ),
    related: nextMark(
      streams.related,
      used.related,
      state.related
    ),
    surprise: nextMark(
      streams.surprise,
      used.surprise,
      state.surprise
    )
  };

  const hasMore = FALLBACK.some((bucket) => {
    const page = streams[bucket];
    const taken = used[bucket];

    if (taken < page.items.length) return true;

    return !page.complete && page.items.length > 0;
  });

  return { items, cursor, hasMore };
}

function encodeMark(mark: StreamMark): [string, string] {
  if (mark.mode === "start") return ["-", "-"];
  if (mark.mode === "done") return ["x", "x"];

  return [
    String(mark.publishedAt),
    encodeURIComponent(mark.id)
  ];
}

export function encodeRankCursor(cursor: RankCursor): string {
  if (
    !isTopicFilter(cursor.topic) ||
    !isMoodFilter(cursor.mood) ||
    !Number.isSafeInteger(cursor.emitted) ||
    cursor.emitted < 0
  ) {
    throw new Error("Invalid feed cursor key");
  }

  const preferred = encodeMark(cursor.preferred);
  const related = encodeMark(cursor.related);
  const surprise = encodeMark(cursor.surprise);

  return [
    "v4",
    cursor.topic,
    cursor.mood,
    cursor.emitted,
    preferred[0],
    preferred[1],
    related[0],
    related[1],
    surprise[0],
    surprise[1],
    cursor.lastTheme ?? "-",
    cursor.lastKind ?? "-"
  ].join(":");
}

function decodeMark(
  at: string,
  idPart: string
): StreamMark | null {
  if (at === "-" && idPart === "-") {
    return startMark();
  }

  if (at === "x" && idPart === "x") {
    return { mode: "done", publishedAt: 0, id: "" };
  }

  if (!/^\d+$/.test(at)) return null;

  const publishedAt = Number(at);

  if (!Number.isSafeInteger(publishedAt)) return null;

  try {
    const id = decodeURIComponent(idPart);

    if (id.length === 0 || id.length > 128) return null;

    return { mode: "after", publishedAt, id };
  } catch {
    return null;
  }
}

export function decodeRankCursor(value: string): RankCursor | null {
  if (value.length === 0 || value.length > 2048) return null;

  const match =
    /^v4:([a-z]+):([a-z]+):(\d+):(-|x|\d+):([^:]*):(-|x|\d+):([^:]*):(-|x|\d+):([^:]*):([a-z]+|-):([a-z]+|-)$/.exec(
      value
    );

  if (!match) return null;

  const topic = match[1] ?? "";
  const mood = match[2] ?? "";
  const emitted = Number(match[3]);

  if (
    !isTopicFilter(topic) ||
    !isMoodFilter(mood) ||
    !Number.isSafeInteger(emitted)
  ) {
    return null;
  }

  const preferred = decodeMark(match[4] ?? "", match[5] ?? "");
  const related = decodeMark(match[6] ?? "", match[7] ?? "");
  const surprise = decodeMark(match[8] ?? "", match[9] ?? "");

  if (!preferred || !related || !surprise) return null;

  const themeToken = match[10] ?? "-";
  const kindToken = match[11] ?? "-";

  let lastTheme: ContentTheme | null = null;
  let lastKind: ContentKind | null = null;

  if (themeToken !== "-") {
    if (!isContentTheme(themeToken)) return null;
    lastTheme = themeToken;
  }

  if (kindToken !== "-") {
    if (!isContentKind(kindToken)) return null;
    lastKind = kindToken;
  }

  return {
    topic,
    mood,
    emitted,
    lastTheme,
    lastKind,
    preferred,
    related,
    surprise
  };
}
