import type {
  ContentItem,
  ContentKind,
  ContentMood,
  ContentStatus,
  ContentTheme,
  ContentTopic
} from "../content/content.types";
import type {
  MoodFilter,
  TopicFilter
} from "../content/filter-contents";
import type { FeedBucket } from "../content/recommend-contents";
import {
  assembleRankedPage,
  decodeRankCursor,
  encodeRankCursor,
  hasDirectMatch,
  startRankCursor,
  type RankStream,
  type StreamMark
} from "./rank-feed";

export interface PublicFeedPage {
  items: ContentItem[];
  nextCursor: string | null;
  hasMore: boolean;
  matched: boolean;
}

export interface ContentRow {
  id: string;
  slug: string;
  kind: string;
  status: string;
  category: string;
  title: string;
  description: string;
  tag: string;
  theme: string;
  published_at: number;
  topics_json: string;
  moods_json: string;
  has_article: number | null;
}

interface RankedContent extends ContentItem {
  publishedAt: number;
}

export function mapRow(row: ContentRow): RankedContent {
  const hasArticle = Number(row.has_article) === 1;

  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind as ContentKind,
    status: row.status as ContentStatus,
    category: row.category,
    title: row.title,
    description: row.description,
    tag: row.tag,
    theme: row.theme as ContentTheme,
    topics: JSON.parse(row.topics_json ?? "[]") as ContentTopic[],
    suitableMoods: JSON.parse(
      row.moods_json ?? "[]"
    ) as ContentMood[],
    ...(hasArticle ? { hasArticle: true } : {}),
    publishedAt: row.published_at
  };
}

export function toContentItem(row: RankedContent): ContentItem {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: row.status,
    category: row.category,
    title: row.title,
    description: row.description,
    tag: row.tag,
    theme: row.theme,
    topics: row.topics,
    suitableMoods: row.suitableMoods,
    ...(row.hasArticle ? { hasArticle: true } : {})
  };
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

/** Mot chu de dang chon, hoac cac chu de yeu thich o "Danh cho ban". */
function bucketQuery(
  bucket: FeedBucket,
  topics: readonly string[],
  mood: MoodFilter,
  mark: StreamMark,
  limit: number
): { sql: string; binds: Array<string | number | null> } | null {
  if (mark.mode === "done") return null;

  const topicOn = topics.length > 0;
  const moodOn = mood !== "all";
  const topicSlot = 3;
  const moodSlot = topicSlot + topics.length;
  const extra: string[] = [...topics];

  if (moodOn) extra.push(mood);

  const topicSql = existsTopic(topicSlot, topics.length);
  const moodSql = existsMood(moodSlot);
  let filterSql: string | null = null;

  if (bucket === "preferred") {
    if (topicOn && moodOn) {
      filterSql = `AND ${topicSql} AND ${moodSql}`;
    } else if (topicOn) {
      filterSql = `AND ${topicSql}`;
    } else if (moodOn) {
      filterSql = `AND ${moodSql}`;
    } else {
      filterSql = "";
    }
  } else if (bucket === "related") {
    if (topicOn && moodOn) {
      filterSql =
        `AND ((${topicSql} AND NOT ${moodSql})` +
        ` OR (${moodSql} AND NOT ${topicSql}))`;
    }
  } else if (topicOn && moodOn) {
    filterSql = `AND NOT ${topicSql} AND NOT ${moodSql}`;
  } else if (topicOn) {
    filterSql = `AND NOT ${topicSql}`;
  } else if (moodOn) {
    filterSql = `AND NOT ${moodSql}`;
  }

  if (filterSql === null) return null;

  const binds: Array<string | number | null> = [
    mark.mode === "after" ? mark.publishedAt : null,
    mark.mode === "after" ? mark.id : null,
    ...extra,
    limit + 1
  ];

  const sql = `
    SELECT
      c.id,
      c.slug,
      c.kind,
      c.status,
      c.category,
      c.title,
      c.description,
      c.tag,
      c.theme,
      c.published_at,
      (
        SELECT json_group_array(ct.topic_slug)
        FROM content_topics ct
        WHERE ct.content_id = c.id
      ) AS topics_json,
      (
        SELECT json_group_array(cm.mood_slug)
        FROM content_moods cm
        WHERE cm.content_id = c.id
      ) AS moods_json,
      (
        SELECT CASE
          WHEN d.body_markdown IS NOT NULL
            AND length(trim(d.body_markdown)) > 0
          THEN 1
          ELSE 0
        END
        FROM content_details d
        WHERE d.content_id = c.id
        LIMIT 1
      ) AS has_article
    FROM contents c
    WHERE c.status = 'published'
      AND c.published_at IS NOT NULL
      AND (
        ?1 IS NULL
        OR c.published_at < ?1
        OR (
          c.published_at = ?1
          AND c.id < ?2
        )
      )
      ${filterSql}
    ORDER BY
      c.published_at DESC,
      c.id DESC
    LIMIT ?${binds.length}
  `;

  return { sql, binds };
}

export async function loadPublicFeed(
  db: D1Database,
  input: {
    topic: TopicFilter;
    mood: MoodFilter;
    cursor: string | null;
    limit: number;
    /** Chi dung o trang dau; trang sau lay tu cursor. */
    favorites?: readonly ContentTopic[];
  }
): Promise<PublicFeedPage> {
  const cursor =
    input.cursor === null
      ? startRankCursor(input.topic, input.mood, input.favorites)
      : decodeRankCursor(input.cursor);

  if (
    !cursor ||
    cursor.topic !== input.topic ||
    cursor.mood !== input.mood
  ) {
    throw new Error("Invalid feed cursor");
  }

  const buckets: FeedBucket[] = [
    "preferred",
    "related",
    "surprise"
  ];
  const jobs: D1PreparedStatement[] = [];
  const order: FeedBucket[] = [];

  const topics =
    input.topic === "all" ? cursor.favorites : [input.topic];

  for (const bucket of buckets) {
    const query = bucketQuery(
      bucket,
      topics,
      input.mood,
      cursor[bucket],
      input.limit
    );

    if (!query) continue;

    order.push(bucket);
    jobs.push(db.prepare(query.sql).bind(...query.binds));
  }

  const streams: Record<FeedBucket, RankStream<RankedContent>> = {
    preferred: { items: [], complete: true },
    related: { items: [], complete: true },
    surprise: { items: [], complete: true }
  };

  if (jobs.length > 0) {
    const results = await db.batch<ContentRow>(jobs);

    for (let index = 0; index < order.length; index++) {
      const bucket = order[index];
      const result = results[index];

      if (!bucket || !result) continue;

      const rows = result.results ?? [];

      streams[bucket] = {
        items: rows.map((row) => mapRow(row)),
        complete: rows.length <= input.limit
      };
    }
  }

  const ranked = assembleRankedPage(
    streams,
    cursor,
    input.limit
  );

  return {
    items: ranked.items.map(toContentItem),
    nextCursor: ranked.hasMore
      ? encodeRankCursor(ranked.cursor)
      : null,
    hasMore: ranked.hasMore,
    // Chu de yeu thich chua co bai thi van la "Danh cho ban", khong bao loi loc.
    matched:
      cursor.favorites.length > 0 ||
      hasDirectMatch(cursor.preferred, streams.preferred.items.length)
  };
}
