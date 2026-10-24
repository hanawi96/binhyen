import type { ContentItem } from "../content/content.types";
import type { MoodFilter, TopicFilter } from "../content/filter-contents";
import { ANONYMOUS_VIEWER, type FeedViewer } from "./d1-viewer-state";
import {
  CARD_COLUMNS,
  mapRow,
  toContentItem,
  type ContentRow,
  type RankedContent
} from "./feed-rows";
import {
  RANK_KEY_MAX,
  assembleRingPage,
  decodeRingCursor,
  freshRange,
  encodeRingCursor,
  randomOrigin,
  ringRange,
  startRingCursor,
  type LaneRows,
  type RingCursor,
  type RingLane
} from "./ring-feed";
import { hasSeen } from "./seen-bits";
import { readPosition } from "./viewer-positions";

export interface PublicFeedPage {
  items: ContentItem[];
  nextCursor: string | null;
  hasMore: boolean;
  matched: boolean;
}

/** "all-seen": nguoi nay vua xem het kho, feed bat dau vong moi. */
export type FeedNotice = "all-seen";

export interface ViewerFeedPage extends PublicFeedPage {
  notice: FeedNotice | null;
  /** Cursor bat dau trang nay; client gui kem khi bao da xem de lan sau di tiep. */
  pageCursor: string;
}

/** Tran so hang doc trong mot request khi phai bo qua nhieu bai da xem. */
export const MAX_SCAN_ROWS = 2000;
const MAX_LANE_ROWS = 200;
/**
 * So luot toi da trong mot request: het luot dang do, mot luot trong
 * (da xem het), roi vong moi.
 */
const MAX_PASSES = 3;

const LANES: readonly RingLane[] = [
  "preferred",
  "related",
  "surprise",
  "fresh"
];

interface Statement {
  sql: string;
  binds: Array<string | number | null>;
}

function existsTopic(firstSlot: number, count: number): string {
  const slots = Array.from(
    { length: count },
    (_, index) => `?${firstSlot + index}`
  ).join(", ");

  return `EXISTS (
    SELECT 1
    FROM content_topics ct
    WHERE ct.content_id = c.id
      AND ct.topic_slug IN (${slots})
  )`;
}

function existsMood(slot: number): string {
  return `EXISTS (
    SELECT 1
    FROM content_moods cm
    WHERE cm.content_id = c.id
      AND cm.mood_slug = ?${slot}
  )`;
}

/**
 * Bo loc cua tung nhom, tham so bat dau tu firstSlot.
 * Lan bai moi chi theo bo loc nguoi dung chon, khong theo chu de yeu thich:
 * o "Danh cho ban" moi bai moi deu duoc tron vao.
 */
export function laneFilter(
  lane: RingLane,
  cursor: Pick<RingCursor, "topic" | "mood" | "favorites">,
  firstSlot: number
): { sql: string; binds: string[] } {
  const topics: readonly string[] =
    cursor.topic !== "all"
      ? [cursor.topic]
      : lane === "fresh"
        ? []
        : cursor.favorites;
  const topicOn = topics.length > 0;
  const moodOn = cursor.mood !== "all";
  const binds: string[] = [...topics];

  if (moodOn) binds.push(cursor.mood);

  const topicSql = existsTopic(firstSlot, topics.length);
  const moodSql = existsMood(firstSlot + topics.length);

  if (lane === "preferred" || lane === "fresh") {
    const parts: string[] = [];
    if (topicOn) parts.push(`AND ${topicSql}`);
    if (moodOn) parts.push(`AND ${moodSql}`);
    return { sql: parts.join(" "), binds };
  }

  if (lane === "related") {
    return {
      sql:
        `AND ((${topicSql} AND NOT ${moodSql})` +
        ` OR (${moodSql} AND NOT ${topicSql}))`,
      binds
    };
  }

  const parts: string[] = [];
  if (topicOn) parts.push(`AND NOT ${topicSql}`);
  if (moodOn) parts.push(`AND NOT ${moodSql}`);
  return { sql: parts.join(" "), binds };
}

/**
 * Mot nhom tren vong. (rank_key, id) > (?1, ?2) va rank_key < ?3 de SQLite
 * tim theo idx_contents_public_rank va dung som o LIMIT.
 * Bai moi hon freshAt di lan bai moi; bai cua chinh nguoi xem bi loai.
 */
export function ringLaneQuery(
  lane: Exclude<RingLane, "fresh">,
  cursor: RingCursor,
  authorId: string | null,
  rows: number
): Statement | null {
  const range = ringRange(cursor[lane], cursor.origin);

  if (!range) return null;

  const filter = laneFilter(lane, cursor, 7);

  return {
    sql: `
      SELECT ${CARD_COLUMNS}
      FROM contents c
      WHERE c.status = 'published'
        AND c.published_at IS NOT NULL
        AND (c.rank_key, c.id) > (?1, ?2)
        AND c.rank_key < ?3
        AND (?4 IS NULL OR c.published_at <= ?4)
        AND (?5 IS NULL OR c.author_id IS NULL OR c.author_id <> ?5)
        ${filter.sql}
      ORDER BY c.rank_key, c.id
      LIMIT ?6`,
    binds: [
      range.afterRankKey,
      range.afterId,
      range.belowRankKey ?? RANK_KEY_MAX + 1,
      cursor.freshAt,
      authorId,
      rows + 1,
      ...filter.binds
    ]
  };
}

/** Lan bai moi: cu nhat truoc trong so bai dang sau freshAt. */
export function freshLaneQuery(
  cursor: RingCursor,
  authorId: string | null,
  rows: number
): Statement | null {
  const range = freshRange(cursor.fresh, cursor.freshAt);

  if (!range) return null;

  const filter = laneFilter("fresh", cursor, 5);

  return {
    sql: `
      SELECT ${CARD_COLUMNS}
      FROM contents c
      WHERE c.status = 'published'
        AND (c.published_at, c.id) > (?1, ?2)
        AND (?3 IS NULL OR c.author_id IS NULL OR c.author_id <> ?3)
        ${filter.sql}
      ORDER BY c.published_at, c.id
      LIMIT ?4`,
    binds: [
      range.afterPublishedAt,
      range.afterId,
      authorId,
      rows + 1,
      ...filter.binds
    ]
  };
}

/** Bo loc co bai rieng khong; chi can cho trang dau de bao "dang xem bai khac". */
export function matchedQuery(
  cursor: RingCursor,
  authorId: string | null
): Statement {
  const filter = laneFilter("preferred", cursor, 2);

  return {
    sql: `
      SELECT EXISTS (
        SELECT 1
        FROM contents c
        WHERE c.status = 'published'
          AND c.published_at IS NOT NULL
          AND (?1 IS NULL OR c.author_id IS NULL OR c.author_id <> ?1)
          ${filter.sql}
      ) AS matched`,
    binds: [authorId, ...filter.binds]
  };
}

function laneQuery(
  lane: RingLane,
  cursor: RingCursor,
  authorId: string | null,
  rows: number
): Statement | null {
  return lane === "fresh"
    ? freshLaneQuery(cursor, authorId, rows)
    : ringLaneQuery(lane, cursor, authorId, rows);
}

async function readLanes(
  db: D1Database,
  cursor: RingCursor,
  authorId: string | null,
  rows: number
): Promise<{ lanes: Record<RingLane, LaneRows<RankedContent>>; read: number }> {
  const lanes: Record<RingLane, LaneRows<RankedContent>> = {
    preferred: { items: [], complete: true },
    related: { items: [], complete: true },
    surprise: { items: [], complete: true },
    fresh: { items: [], complete: true }
  };
  const order: RingLane[] = [];
  const jobs: D1PreparedStatement[] = [];

  for (const lane of LANES) {
    const query = laneQuery(lane, cursor, authorId, rows);

    if (!query) continue;

    order.push(lane);
    jobs.push(db.prepare(query.sql).bind(...query.binds));
  }

  if (jobs.length === 0) return { lanes, read: 0 };

  const results = await db.batch<ContentRow>(jobs);
  let read = 0;

  order.forEach((lane, index) => {
    const found = results[index]?.results ?? [];

    read += found.length;
    lanes[lane] = {
      items: found.map(mapRow),
      complete: found.length <= rows
    };
  });

  return { lanes, read };
}

function savedCursor(
  viewer: FeedViewer,
  topic: TopicFilter,
  mood: MoodFilter
): RingCursor | null {
  const raw = viewer.state
    ? readPosition(viewer.state.positions, topic, mood)
    : null;
  const cursor = raw === null ? null : decodeRingCursor(raw);

  return cursor && cursor.topic === topic && cursor.mood === mood
    ? cursor
    : null;
}

/** Diem dang dung tren vong cua mot cursor, de bo loc khac di tiep tu do. */
function ringPoint(cursor: RingCursor): number {
  return cursor.preferred.mode === "after"
    ? cursor.preferred.rankKey
    : cursor.origin;
}

/**
 * Trang dau cua mot bo loc: di tiep vi tri da luu neu chu de yeu thich
 * khong doi; khong thi bat dau tu cho dang dung o bo loc ay hoac o
 * "Danh cho ban"; nguoi moi bat dau o mot diem ngau nhien.
 */
export function chooseStartCursor(
  viewer: FeedViewer,
  topic: TopicFilter,
  mood: MoodFilter,
  origin: () => number = randomOrigin
): RingCursor {
  const start = (point: number) =>
    startRingCursor({
      topic,
      mood,
      origin: point,
      freshAt: viewer.state?.freshAt ?? null,
      favorites: viewer.favorites
    });

  if (!viewer.state) return start(origin());

  const saved = savedCursor(viewer, topic, mood);
  const favorites = start(0).favorites.join(".");

  if (saved && saved.favorites.join(".") === favorites) {
    // Vi tri luu tu luc chua co trang thai (chua co lan bai moi). Bat lan bai
    // moi tu dau: bai sau moc chi chuyen tu vong sang lan nay, khong mat bai.
    return saved.freshAt === null
      ? {
          ...saved,
          freshAt: viewer.state.freshAt,
          fresh: { mode: "start", publishedAt: 0, id: "" }
        }
      : saved;
  }

  const anchor = saved ?? savedCursor(viewer, "all", "all");

  return start(anchor ? ringPoint(anchor) : origin());
}

/** Luot moi cung diem xuat phat: bai da xem lau nhat quay lai truoc. */
function nextPass(cursor: RingCursor, viewer: FeedViewer): RingCursor {
  return startRingCursor({
    topic: cursor.topic,
    mood: cursor.mood,
    origin: cursor.origin,
    freshAt: viewer.state?.freshAt ?? null,
    favorites: cursor.favorites
  });
}

/**
 * Feed cong khai cho mot nguoi xem.
 * Moi vong doc mot batch (toi da 4 nhom), bo bai da xem, cho toi khi du
 * trang hoac cham tran MAX_SCAN_ROWS. Het mot luot thi mo luot moi; ca mot
 * luot khong con bai nao chua xem thi goi onAllSeen de bat dau vong moi.
 */
export async function loadPublicFeed(
  db: D1Database,
  input: {
    topic: TopicFilter;
    mood: MoodFilter;
    /** null: trang dau cua bo loc. */
    cursor: RingCursor | null;
    limit: number;
    viewer?: FeedViewer;
    /** Tra bitmap moi sau khi da bat dau vong moi. */
    onAllSeen?: () => Promise<Uint8Array>;
    origin?: () => number;
  }
): Promise<ViewerFeedPage> {
  const viewer = input.viewer ?? ANONYMOUS_VIEWER;
  const authorId = viewer.userId;

  if (
    input.cursor &&
    (input.cursor.topic !== input.topic || input.cursor.mood !== input.mood)
  ) {
    throw new Error("Invalid feed cursor");
  }

  let cursor =
    input.cursor ??
    chooseStartCursor(viewer, input.topic, input.mood, input.origin);
  /** Cursor ngay truoc vong doc dau tien co ra bai: mo lai thi gap lai bai dau trang. */
  let pageStart: RingCursor | null = null;

  const matchedFor =
    input.cursor === null && (input.topic !== "all" || input.mood !== "all")
      ? cursor
      : null;

  let seen = viewer.state?.seen ?? new Uint8Array(0);
  const shown = new Set<string>();
  const items: RankedContent[] = [];
  const isSeen = (item: RankedContent) =>
    shown.has(item.id) || hasSeen(seen, item.seq);

  let rows = input.limit + 1;
  let scanned = 0;
  let passes = 0;
  let restarted = false;
  let ended = false;

  while (items.length < input.limit && scanned < MAX_SCAN_ROWS) {
    const { lanes, read } = await readLanes(db, cursor, authorId, rows);

    scanned += read;

    const page = assembleRingPage(
      lanes,
      cursor,
      input.limit - items.length,
      isSeen
    );

    for (const item of page.items) {
      shown.add(item.id);
      items.push(item);
    }

    if (!pageStart && page.items.length > 0) pageStart = cursor;

    cursor = page.cursor;

    if (page.hasMore) {
      rows = Math.min(rows * 2, MAX_LANE_ROWS);
      continue;
    }

    // Ca mot luot khong con bai nao chua xem.
    if (cursor.emitted === 0) {
      // Bai con lai vua dua ra o request nay, nguoi xem chua xem toi:
      // chua phai da xem het.
      if (items.length > 0) {
        cursor = nextPass(cursor, viewer);
        break;
      }

      if (
        restarted ||
        !input.onAllSeen ||
        (viewer.state?.seenCount ?? 0) === 0
      ) {
        ended = true;
        break;
      }

      seen = await input.onAllSeen();
      restarted = true;
    }

    cursor = nextPass(cursor, viewer);
    passes += 1;

    if (passes >= MAX_PASSES) break;
  }

  let matched = true;

  if (matchedFor) {
    const query = matchedQuery(matchedFor, authorId);
    const value = await db
      .prepare(query.sql)
      .bind(...query.binds)
      .first<number>("matched");

    matched = Number(value) === 1;
  }

  return {
    items: items.map(toContentItem),
    nextCursor: ended ? null : encodeRingCursor(cursor),
    hasMore: !ended,
    matched,
    notice: restarted ? "all-seen" : null,
    pageCursor: encodeRingCursor(pageStart ?? cursor)
  };
}
