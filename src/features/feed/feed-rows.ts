import {
  isContentFormat,
  type ContentItem,
  type ContentKind,
  type ContentMood,
  type ContentStatus,
  type ContentTheme,
  type ContentTopic
} from "../content/content.types";

/** Cot cua mot the trong feed; bang contents phai co ten bi danh c. */
export const CARD_COLUMNS = `
  c.id,
  c.slug,
  c.format,
  c.kind,
  c.status,
  c.category,
  c.title,
  c.description,
  c.tag,
  c.theme,
  c.published_at,
  c.rank_key,
  c.seq,
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
  ) AS has_article,
  COALESCE(
    (SELECT s.like_count FROM content_stats s WHERE s.content_id = c.id),
    0
  ) AS like_count,
  COALESCE(
    (SELECT s.save_count FROM content_stats s WHERE s.content_id = c.id),
    0
  ) AS save_count,
  COALESCE(
    (SELECT s.share_count FROM content_stats s WHERE s.content_id = c.id),
    0
  ) AS share_count`;

export interface ContentRow {
  id: string;
  slug: string;
  format: string;
  kind: string;
  status: string;
  category: string;
  title: string;
  description: string;
  tag: string;
  theme: string;
  published_at: number;
  rank_key: number;
  seq: number;
  topics_json: string;
  moods_json: string;
  has_article: number | null;
  like_count: number;
  save_count: number;
  share_count: number;
}

/** The kem khoa sap xep; khoa chi dung o server, khong gui xuong client. */
export interface RankedContent extends ContentItem {
  publishedAt: number;
  rankKey: number;
  seq: number;
}

function asCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function mapRow(row: ContentRow): RankedContent {
  const hasArticle = Number(row.has_article) === 1;

  return {
    id: row.id,
    slug: row.slug,
    format: isContentFormat(row.format) ? row.format : "text",
    kind: row.kind as ContentKind,
    status: row.status as ContentStatus,
    category: row.category,
    title: row.title,
    description: row.description,
    tag: row.tag,
    theme: row.theme as ContentTheme,
    topics: JSON.parse(row.topics_json ?? "[]") as ContentTopic[],
    suitableMoods: JSON.parse(row.moods_json ?? "[]") as ContentMood[],
    ...(hasArticle ? { hasArticle: true } : {}),
    likeCount: asCount(row.like_count),
    saveCount: asCount(row.save_count),
    shareCount: asCount(row.share_count),
    publishedAt: row.published_at,
    rankKey: row.rank_key,
    seq: row.seq
  };
}

export function toContentItem(row: RankedContent): ContentItem {
  return {
    id: row.id,
    slug: row.slug,
    format: row.format,
    kind: row.kind,
    status: row.status,
    category: row.category,
    title: row.title,
    description: row.description,
    tag: row.tag,
    theme: row.theme,
    topics: row.topics,
    suitableMoods: row.suitableMoods,
    ...(row.hasArticle ? { hasArticle: true } : {}),
    likeCount: row.likeCount ?? 0,
    saveCount: row.saveCount ?? 0,
    shareCount: row.shareCount ?? 0,
    ...(typeof row.liked === "boolean" ? { liked: row.liked } : {}),
    ...(typeof row.saved === "boolean" ? { saved: row.saved } : {})
  };
}

/**
 * Gan liked/saved cua ma dang xem vao tung the (mot truy van theo PRIMARY KEY).
 * Khong co actor thi giu liked/saved = false (khong gui xuong client).
 */
export async function attachViewerReactions(
  db: D1Database,
  items: ContentItem[],
  actorId: string | null
): Promise<ContentItem[]> {
  if (!actorId || items.length === 0) return items;

  const slots = items.map((_, index) => `?${index + 2}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT content_id, kind
       FROM content_reactions
       WHERE actor_id = ?1
         AND kind IN ('like', 'save')
         AND content_id IN (${slots})`
    )
    .bind(actorId, ...items.map((item) => item.id))
    .all<{ content_id: string; kind: string }>();

  const liked = new Set<string>();
  const saved = new Set<string>();

  for (const row of results) {
    if (row.kind === "like") liked.add(row.content_id);
    else if (row.kind === "save") saved.add(row.content_id);
  }

  // Luon gan boolean khi biet actor: client khoi can GET /reactions tung the.
  return items.map((item) => ({
    ...item,
    liked: liked.has(item.id),
    saved: saved.has(item.id)
  }));
}
