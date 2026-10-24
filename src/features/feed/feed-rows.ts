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
  ) AS has_article`;

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
}

/** The kem khoa sap xep; khoa chi dung o server, khong gui xuong client. */
export interface RankedContent extends ContentItem {
  publishedAt: number;
  rankKey: number;
  seq: number;
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
    ...(row.hasArticle ? { hasArticle: true } : {})
  };
}
