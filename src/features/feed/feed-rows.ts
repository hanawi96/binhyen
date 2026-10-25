import {
  isContentFormat,
  type ContentItem,
  type ContentKind,
  type ContentMood,
  type ContentPollOption,
  type ContentStatus,
  type ContentTheme,
  type ContentTopic
} from "../content/content.types";
import { readContentImage, readContentVideo } from "../content/content-media";

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
  c.source_label,
  c.source_url,
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
  ) AS share_count,
  (
    SELECT json_object(
      'kind', m.kind,
      'url', m.url,
      'alt', m.alt,
      'width', m.width,
      'height', m.height,
      'poster_url', m.poster_url
    )
    FROM content_media m
    WHERE m.content_id = c.id
  ) AS media_json,
  (
    SELECT json_group_array(
      json_object('id', p.option_id, 'label', p.label)
    )
    FROM (
      SELECT option_id, label
      FROM poll_options
      WHERE content_id = c.id
      ORDER BY sort_order, option_id
    ) AS p
  ) AS poll_options_json`;

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
  source_label: string | null;
  source_url: string | null;
  published_at: number;
  rank_key: number;
  seq: number;
  topics_json: string;
  moods_json: string;
  has_article: number | null;
  like_count: number;
  save_count: number;
  share_count: number;
  media_json: string | null;
  poll_options_json: string | null;
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

const POLL_OPTION_ID = /^o[1-4]$/;

/** Chi nhan o1..o4 + label hop le; bo mang rong / hong. */
export function readPollOptions(value: unknown): ContentPollOption[] | undefined {
  let raw = value;

  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text || text === "null") return undefined;
    try {
      raw = JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const options: ContentPollOption[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { id?: unknown; label?: unknown };
    if (typeof row.id !== "string" || !POLL_OPTION_ID.test(row.id)) continue;
    if (typeof row.label !== "string") continue;
    const label = row.label.trim().replace(/\s+/g, " ");
    if (!label || label.length > 120) continue;
    if (options.some((item) => item.id === row.id)) continue;
    options.push({ id: row.id, label });
  }

  return options.length >= 2 ? options : undefined;
}

export function mapRow(row: ContentRow): RankedContent {
  const hasArticle = Number(row.has_article) === 1;
  const format = isContentFormat(row.format) ? row.format : "text";
  const image =
    format === "image" ? readContentImage(row.media_json) : undefined;
  const video =
    format === "video" ? readContentVideo(row.media_json) : undefined;
  const pollOptions =
    format === "poll" ? readPollOptions(row.poll_options_json) : undefined;

  const sourceLabel =
    typeof row.source_label === "string" ? row.source_label.trim() : "";
  const sourceUrl =
    typeof row.source_url === "string" ? row.source_url.trim() : "";

  return {
    id: row.id,
    slug: row.slug,
    format,
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
    ...(sourceLabel
      ? { source: { label: sourceLabel, url: sourceUrl } }
      : {}),
    ...(image ? { image } : {}),
    ...(video ? { video } : {}),
    ...(pollOptions ? { pollOptions } : {}),
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
    ...(typeof row.saved === "boolean" ? { saved: row.saved } : {}),
    ...(row.source ? { source: row.source } : {}),
    ...(row.image ? { image: row.image } : {}),
    ...(row.video ? { video: row.video } : {}),
    ...(row.pollOptions ? { pollOptions: row.pollOptions } : {})
  };
}

/**
 * Gan liked/saved cua ma dang xem vao tung the (mot truy van theo PRIMARY KEY).
 * Khong co actor: van gan liked/saved = false de client khoi GET /reactions.
 */
export async function attachViewerReactions(
  db: D1Database,
  items: ContentItem[],
  actorId: string | null
): Promise<ContentItem[]> {
  if (items.length === 0) return items;

  if (!actorId) {
    return items.map((item) => ({
      ...item,
      liked: false,
      saved: false
    }));
  }

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
