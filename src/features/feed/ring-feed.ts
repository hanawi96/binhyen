import { CONTENT_ID_PATTERN } from "../admin/admin-http";
import {
  isContentKind,
  isContentTheme,
  isContentTopic,
  type ContentKind,
  type ContentTheme,
  type ContentTopic
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

/**
 * Feed theo vong xao tron: bai sap theo (rank_key, id) tang dan.
 * Moi nguoi bat dau o mot diem (origin), di toi cuoi vong roi quay ve dau
 * va dung truoc origin. Het mot vong moi gap lai bai cu.
 * Bai xuat ban sau freshAt di lan rieng, tron vao moi FRESH_EVERY the.
 */

export const RANK_KEY_MAX = 2147483647;
export const FRESH_EVERY = 5;

const MAX_FAVORITES = 8;
const MAX_CURSOR_LENGTH = 1024;

export interface RingItem {
  id: string;
  theme: string;
  kind: string;
  publishedAt: number;
  rankKey: number;
}

export type RingLane = FeedBucket | "fresh";

/** wrapped = false: tu origin toi cuoi vong; true: tu dau vong toi truoc origin. */
export interface RingMark {
  mode: "start" | "after" | "done";
  wrapped: boolean;
  rankKey: number;
  id: string;
}

/** Lan bai moi: published_at tang dan, id tang dan. */
export interface FreshMark {
  mode: "start" | "after" | "done";
  publishedAt: number;
  id: string;
}

export interface RingCursor {
  topic: TopicFilter;
  mood: MoodFilter;
  /** Chu de yeu thich, chot tu trang dau de ca phien on dinh. */
  favorites: ContentTopic[];
  origin: number;
  /** Chot luc tao cursor de cac trang cung mot ranh gioi; null la khong co lan bai moi. */
  freshAt: number | null;
  emitted: number;
  lastTheme: ContentTheme | null;
  lastKind: ContentKind | null;
  preferred: RingMark;
  related: RingMark;
  surprise: RingMark;
  fresh: FreshMark;
}

export interface LaneRows<T> {
  items: T[];
  /** true khi da doc toi het khoang cua lan nay. */
  complete: boolean;
}

/** Hang phai nam sau (afterRankKey, afterId); id rong thi lay ca rank_key do. */
export interface RingRange {
  afterRankKey: number;
  afterId: string;
  /** Chi lay rank_key nho hon; null la toi cuoi vong. */
  belowRankKey: number | null;
}

export interface FreshRange {
  afterPublishedAt: number;
  afterId: string;
}

const RING_LANES: readonly FeedBucket[] = [
  "preferred",
  "related",
  "surprise"
];

function ringStart(): RingMark {
  return { mode: "start", wrapped: false, rankKey: 0, id: "" };
}

function ringDone(): RingMark {
  return { mode: "done", wrapped: false, rankKey: 0, id: "" };
}

function freshDone(): FreshMark {
  return { mode: "done", publishedAt: 0, id: "" };
}

export function isRankKey(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= RANK_KEY_MAX;
}

function isTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function randomOrigin(): number {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return (value ?? 0) & RANK_KEY_MAX;
}

/** Chi dung khi khong loc gi; sap xep de cursor gon va on dinh. */
function cleanFavorites(
  topic: TopicFilter,
  mood: MoodFilter,
  favorites: readonly ContentTopic[]
): ContentTopic[] {
  if (topic !== "all" || mood !== "all") return [];
  return [...new Set(favorites)].sort().slice(0, MAX_FAVORITES);
}

/**
 * Nhom nao co nghia voi bo loc nay. Khong loc gi thi "preferred" la ca kho;
 * "related" chi co khi loc ca chu de lan tam trang.
 */
export function activeLanes(
  topic: TopicFilter,
  mood: MoodFilter,
  favorites: readonly ContentTopic[]
): Record<FeedBucket, boolean> {
  const topicOn = topic !== "all" || favorites.length > 0;
  const moodOn = mood !== "all";

  return {
    preferred: true,
    related: topic !== "all" && moodOn,
    surprise: topicOn || moodOn
  };
}

export function startRingCursor(input: {
  topic: TopicFilter;
  mood: MoodFilter;
  origin: number;
  freshAt: number | null;
  favorites?: readonly ContentTopic[];
}): RingCursor {
  if (
    !isRankKey(input.origin) ||
    (input.freshAt !== null && !isTimestamp(input.freshAt))
  ) {
    throw new Error("Invalid ring cursor start");
  }

  const favorites = cleanFavorites(
    input.topic,
    input.mood,
    input.favorites ?? []
  );
  const active = activeLanes(input.topic, input.mood, favorites);

  return {
    topic: input.topic,
    mood: input.mood,
    favorites,
    origin: input.origin,
    freshAt: input.freshAt,
    emitted: 0,
    lastTheme: null,
    lastKind: null,
    preferred: ringStart(),
    related: active.related ? ringStart() : ringDone(),
    surprise: active.surprise ? ringStart() : ringDone(),
    fresh:
      input.freshAt === null
        ? freshDone()
        : { mode: "start", publishedAt: 0, id: "" }
  };
}

/** Khoang can doc tiep cua mot nhom tren vong; null la nhom da het. */
export function ringRange(mark: RingMark, origin: number): RingRange | null {
  if (mark.mode === "done") return null;

  const belowRankKey = mark.wrapped ? origin : null;

  if (mark.mode === "start") {
    return {
      afterRankKey: mark.wrapped ? 0 : origin,
      afterId: "",
      belowRankKey
    };
  }

  return { afterRankKey: mark.rankKey, afterId: mark.id, belowRankKey };
}

/** Phai trung voi dieu kien SQL cua loader. */
export function inRingRange(
  item: Pick<RingItem, "rankKey" | "id">,
  range: RingRange
): boolean {
  const after =
    item.rankKey > range.afterRankKey ||
    (item.rankKey === range.afterRankKey && item.id > range.afterId);

  return (
    after &&
    (range.belowRankKey === null || item.rankKey < range.belowRankKey)
  );
}

export function freshRange(
  mark: FreshMark,
  freshAt: number | null
): FreshRange | null {
  if (mark.mode === "done" || freshAt === null) return null;

  if (mark.mode === "start") {
    return { afterPublishedAt: freshAt + 1, afterId: "" };
  }

  return { afterPublishedAt: mark.publishedAt, afterId: mark.id };
}

export function inFreshRange(
  item: Pick<RingItem, "publishedAt" | "id">,
  range: FreshRange
): boolean {
  return (
    item.publishedAt > range.afterPublishedAt ||
    (item.publishedAt === range.afterPublishedAt && item.id > range.afterId)
  );
}

/** Bai moi chi di lan bai moi, khong lap lai tren vong cua cung cursor. */
export function isFresh(publishedAt: number, freshAt: number | null): boolean {
  return freshAt !== null && publishedAt > freshAt;
}

/**
 * Ne hai the lien nhau cung theme hoac cung loai. Khi dang loc, bai cung
 * chu de thuong chung theme; chi xet loai de phan lon the van dung chu de.
 */
function repeatsPrevious(
  item: RingItem,
  theme: ContentTheme | null,
  kind: ContentKind | null,
  kindOnly: boolean
): boolean {
  if (theme === null || kind === null) return false;
  if (item.kind === kind) return true;

  return !kindOnly && item.theme === theme;
}

function nextRingMark<T extends RingItem>(
  rows: LaneRows<T>,
  used: number,
  previous: RingMark,
  origin: number
): RingMark {
  if (previous.mode === "done") return previous;

  if (rows.complete && used >= rows.items.length) {
    if (previous.wrapped || origin === 0) return ringDone();
    return { mode: "start", wrapped: true, rankKey: 0, id: "" };
  }

  const last = used > 0 ? rows.items[used - 1] : undefined;

  if (!last) return previous;

  return {
    mode: "after",
    wrapped: previous.wrapped,
    rankKey: last.rankKey,
    id: last.id
  };
}

function nextFreshMark<T extends RingItem>(
  rows: LaneRows<T>,
  used: number,
  previous: FreshMark
): FreshMark {
  if (previous.mode === "done") return previous;
  if (rows.complete && used >= rows.items.length) return freshDone();

  const last = used > 0 ? rows.items[used - 1] : undefined;

  if (!last) return previous;

  return { mode: "after", publishedAt: last.publishedAt, id: last.id };
}

/**
 * Ghep mot trang tu cac lan da doc. Bai da xem bi bo qua nhung van
 * day vi tri len, nen cursor luon tien va khong ket o mot cho.
 */
export function assembleRingPage<T extends RingItem>(
  lanes: Record<RingLane, LaneRows<T>>,
  state: RingCursor,
  limit: number,
  isSeen: (item: T) => boolean = () => false
): {
  items: T[];
  cursor: RingCursor;
  hasMore: boolean;
} {
  const used: Record<RingLane, number> = {
    preferred: 0,
    related: 0,
    surprise: 0,
    fresh: 0
  };
  const taken = new Set<string>();
  const items: T[] = [];
  const kindOnly = state.topic !== "all" || state.mood !== "all";
  let emitted = state.emitted;
  let lastTheme = state.lastTheme;
  let lastKind = state.lastKind;

  const head = (lane: RingLane): T | undefined => {
    const rows = lanes[lane].items;
    let item = rows[used[lane]];

    while (item && (taken.has(item.id) || isSeen(item))) {
      used[lane] += 1;
      item = rows[used[lane]];
    }

    return item;
  };

  while (items.length < limit) {
    const wanted =
      FEED_MIX_PATTERN[emitted % FEED_MIX_PATTERN.length] ?? "preferred";
    const freshSlot = emitted % FRESH_EVERY === FRESH_EVERY - 1;
    // Ngoai o cua bai moi, lan bai moi khong duoc dung de ne the lap,
    // neu khong bai moi se chen nhieu hon FRESH_EVERY.
    const order: RingLane[] = freshSlot
      ? ["fresh", wanted, ...RING_LANES]
      : [wanted, ...RING_LANES];
    const tried = new Set<RingLane>();
    let first: RingLane | null = null;
    let chosen: RingLane | null = null;

    for (const lane of order) {
      if (tried.has(lane)) continue;

      tried.add(lane);

      const item = head(lane);

      if (!item) continue;

      if (!first) first = lane;

      if (!repeatsPrevious(item, lastTheme, lastKind, kindOnly)) {
        chosen = lane;
        break;
      }
    }

    const lane =
      chosen ?? first ?? (!freshSlot && head("fresh") ? "fresh" : null);

    if (!lane) break;

    const item = head(lane);

    if (!item) break;

    used[lane] += 1;
    taken.add(item.id);
    items.push(item);
    emitted += 1;

    if (isContentTheme(item.theme)) lastTheme = item.theme;
    if (isContentKind(item.kind)) lastKind = item.kind;
  }

  const cursor: RingCursor = {
    ...state,
    emitted,
    lastTheme,
    lastKind,
    preferred: nextRingMark(
      lanes.preferred,
      used.preferred,
      state.preferred,
      state.origin
    ),
    related: nextRingMark(
      lanes.related,
      used.related,
      state.related,
      state.origin
    ),
    surprise: nextRingMark(
      lanes.surprise,
      used.surprise,
      state.surprise,
      state.origin
    ),
    fresh: nextFreshMark(lanes.fresh, used.fresh, state.fresh)
  };

  const hasMore =
    RING_LANES.some((lane) => cursor[lane].mode !== "done") ||
    cursor.fresh.mode !== "done";

  return { items, cursor, hasMore };
}

function encodeRingMark(mark: RingMark): [string, string] {
  if (mark.mode === "done") return ["x", "x"];

  const prefix = mark.wrapped ? "w" : "";

  if (mark.mode === "start") return [prefix || "-", "-"];

  return [`${prefix}${mark.rankKey}`, mark.id];
}

function encodeFreshMark(mark: FreshMark): [string, string] {
  if (mark.mode === "done") return ["x", "x"];
  if (mark.mode === "start") return ["-", "-"];

  return [String(mark.publishedAt), mark.id];
}

function validRingMark(mark: RingMark): boolean {
  return (
    mark.mode !== "after" ||
    (isRankKey(mark.rankKey) && CONTENT_ID_PATTERN.test(mark.id))
  );
}

function validFreshMark(mark: FreshMark): boolean {
  return (
    mark.mode !== "after" ||
    (isTimestamp(mark.publishedAt) && CONTENT_ID_PATTERN.test(mark.id))
  );
}

export function encodeRingCursor(cursor: RingCursor): string {
  if (
    !isTopicFilter(cursor.topic) ||
    !isMoodFilter(cursor.mood) ||
    !isRankKey(cursor.origin) ||
    (cursor.freshAt !== null && !isTimestamp(cursor.freshAt)) ||
    !Number.isSafeInteger(cursor.emitted) ||
    cursor.emitted < 0 ||
    !RING_LANES.every((lane) => validRingMark(cursor[lane])) ||
    !validFreshMark(cursor.fresh)
  ) {
    throw new Error("Invalid ring cursor");
  }

  return [
    "v6",
    cursor.topic,
    cursor.mood,
    cursor.favorites.length > 0 ? cursor.favorites.join(".") : "-",
    cursor.origin,
    cursor.freshAt ?? "-",
    cursor.emitted,
    ...encodeRingMark(cursor.preferred),
    ...encodeRingMark(cursor.related),
    ...encodeRingMark(cursor.surprise),
    ...encodeFreshMark(cursor.fresh),
    cursor.lastTheme ?? "-",
    cursor.lastKind ?? "-"
  ].join(":");
}

function decodeRingMark(at: string, id: string): RingMark | null {
  if (at === "x") return id === "x" ? ringDone() : null;

  if (at === "-" || at === "w") {
    return id === "-"
      ? { mode: "start", wrapped: at === "w", rankKey: 0, id: "" }
      : null;
  }

  const wrapped = at.startsWith("w");
  const digits = wrapped ? at.slice(1) : at;

  if (!/^\d{1,10}$/.test(digits)) return null;

  const rankKey = Number(digits);

  if (!isRankKey(rankKey) || !CONTENT_ID_PATTERN.test(id)) return null;

  return { mode: "after", wrapped, rankKey, id };
}

function decodeFreshMark(at: string, id: string): FreshMark | null {
  if (at === "x") return id === "x" ? freshDone() : null;
  if (at === "-") return id === "-" ? { mode: "start", publishedAt: 0, id: "" } : null;

  if (!/^\d{1,12}$/.test(at)) return null;

  const publishedAt = Number(at);

  if (!isTimestamp(publishedAt) || !CONTENT_ID_PATTERN.test(id)) return null;

  return { mode: "after", publishedAt, id };
}

const RING_CURSOR_PATTERN = new RegExp(
  "^v6:([a-z]+):([a-z]+):(-|[a-z]+(?:\\.[a-z]+)*):(\\d{1,10}):(-|\\d{1,12}):(\\d{1,9})" +
    ":([^:]+):([^:]+)".repeat(4) +
    ":([a-z]+|-):([a-z]+|-)$"
);

export function decodeRingCursor(value: string): RingCursor | null {
  if (value.length === 0 || value.length > MAX_CURSOR_LENGTH) return null;

  const match = RING_CURSOR_PATTERN.exec(value);

  if (!match) return null;

  const part = (index: number) => match[index] ?? "";
  const topic = part(1);
  const mood = part(2);
  const favoriteToken = part(3);
  const origin = Number(part(4));
  const freshAt = part(5) === "-" ? null : Number(part(5));
  const emitted = Number(part(6));

  if (
    !isTopicFilter(topic) ||
    !isMoodFilter(mood) ||
    !isRankKey(origin) ||
    (freshAt !== null && !isTimestamp(freshAt)) ||
    !Number.isSafeInteger(emitted)
  ) {
    return null;
  }

  const favoriteParts =
    favoriteToken === "-" ? [] : favoriteToken.split(".");
  const favorites = favoriteParts.filter(isContentTopic);

  if (
    favorites.length !== favoriteParts.length ||
    cleanFavorites(topic, mood, favorites).join(".") !== favorites.join(".")
  ) {
    return null;
  }

  const preferred = decodeRingMark(part(7), part(8));
  const related = decodeRingMark(part(9), part(10));
  const surprise = decodeRingMark(part(11), part(12));
  const fresh = decodeFreshMark(part(13), part(14));

  if (!preferred || !related || !surprise || !fresh) return null;

  const active = activeLanes(topic, mood, favorites);

  if (
    (!active.related && related.mode !== "done") ||
    (!active.surprise && surprise.mode !== "done") ||
    (freshAt === null && fresh.mode !== "done")
  ) {
    return null;
  }

  const themeToken = part(15);
  const kindToken = part(16);
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
    favorites,
    origin,
    freshAt,
    emitted,
    lastTheme,
    lastKind,
    preferred,
    related,
    surprise,
    fresh
  };
}
