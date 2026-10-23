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

interface ContentRow {
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
}

interface RankedContent extends ContentItem {
  publishedAt: number;
}

function mapRow(row: ContentRow): RankedContent {
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
    publishedAt: row.published_at
  };
}

function toContentItem(row: RankedContent): ContentItem {
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
    suitableMoods: row.suitableMoods
  };
}

function existsTopic(slot: number): string {
  return `EXISTS (
    SELECT 1
    FROM content_topics ct
    WHERE ct.content_id = c.id
      AND ct.topic_slug = ?${slot}
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

function bucketQuery(
  bucket: FeedBucket,
  topic: TopicFilter,
  mood: MoodFilter,
  mark: StreamMark,
  limit: number
): { sql: string; binds: Array<string | number | null> } | null {
  if (mark.mode === "done") return null;

  const topicOn = topic !== "all";
  const moodOn = mood !== "all";
  const topicSlot = 3;
  const moodSlot = topicOn ? 4 : 3;
  const extra: string[] = [];

  if (topicOn) extra.push(topic);
  if (moodOn) extra.push(mood);

  const topicSql = existsTopic(topicSlot);
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
      ) AS moods_json
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
  }
): Promise<PublicFeedPage> {
  const cursor =
    input.cursor === null
      ? startRankCursor(input.topic, input.mood)
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

  for (const bucket of buckets) {
    const query = bucketQuery(
      bucket,
      input.topic,
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
    matched: hasDirectMatch(
      cursor.preferred,
      streams.preferred.items.length
    )
  };
}
