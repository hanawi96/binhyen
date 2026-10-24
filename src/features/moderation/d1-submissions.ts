import {
  isContentTheme,
  type ContentStatus,
  type ContentTheme
} from "../content/content.types";
import {
  encodeMyCursor,
  type MyReactionCursor
} from "../interactions/my-reactions";
import { isContentStatus } from "../admin/change-content-status";
import { REJECT_NOTE } from "../posts/d1-my-posts";

export interface Submission {
  id: string;
  title: string;
  description: string;
  body: string;
  category: string;
  theme: ContentTheme;
  status: ContentStatus;
  topics: string[];
  authorName: string;
  createdAt: number;
  publishedAt: number | null;
  /** Ly do tu choi, chi co voi bai da tu choi. */
  note: string | null;
  /** Lan sua noi dung cuoi sau khi gui; null neu chua sua. */
  editedAt: number | null;
}

export type SubmissionCounts = Record<ContentStatus, number>;

interface Row {
  id: string;
  title: string;
  description: string;
  body_markdown: string | null;
  category: string;
  theme: string;
  status: string;
  topic_labels: string | null;
  author_name: string;
  created_at: number;
  published_at: number | null;
  note: string | null;
  edited_at: number | null;
}

function toSubmission(row: Row): Submission {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    body: row.body_markdown ?? "",
    category: row.category,
    theme: isContentTheme(row.theme) ? row.theme : "peace",
    status: isContentStatus(row.status) ? row.status : "draft",
    topics: row.topic_labels ? row.topic_labels.split("\u001f") : [],
    authorName: row.author_name,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    note: row.note,
    editedAt: row.edited_at
  };
}

/** Chi bai co tac gia; bai quan tri tu dang khong nam o day. */
export async function listSubmissions(
  db: D1Database,
  status: ContentStatus,
  cursor: MyReactionCursor | null,
  limit: number
): Promise<{ items: Submission[]; nextCursor: string | null }> {
  const { results } = await db
    .prepare(
      `SELECT
         c.id, c.title, c.description, c.category, c.theme, c.status,
         c.created_at, c.published_at, d.body_markdown,
         u.display_name AS author_name,
         (
           SELECT group_concat(t.label, char(31))
           FROM content_topics ct
           JOIN topics t ON t.slug = ct.topic_slug
           WHERE ct.content_id = c.id
         ) AS topic_labels,
         ${REJECT_NOTE} AS note,
         -- Doi trang thai cung cap nhat updated_at; chi tinh la sua noi dung
         -- khi moi hon ca luc gui lan lan doi trang thai cuoi.
         CASE WHEN c.updated_at > MAX(
           c.created_at,
           COALESCE(
             (SELECT MAX(e.created_at) FROM content_status_events e
              WHERE e.content_id = c.id),
             0
           )
         ) THEN c.updated_at END AS edited_at
       FROM contents c
       JOIN users u ON u.id = c.author_id
       LEFT JOIN content_details d ON d.content_id = c.id
       WHERE c.author_id IS NOT NULL
         AND c.status = ?1
         AND (
           ?2 IS NULL
           OR c.created_at < ?2
           OR (c.created_at = ?2 AND c.id < ?3)
         )
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ?4`
    )
    .bind(status, cursor?.reactedAt ?? null, cursor?.id ?? null, limit + 1)
    .all<Row>();

  const items = results.slice(0, limit).map(toSubmission);
  const last = items[items.length - 1];

  return {
    items,
    nextCursor:
      results.length > limit && last
        ? encodeMyCursor({ reactedAt: last.createdAt, id: last.id })
        : null
  };
}

export async function countSubmissions(
  db: D1Database
): Promise<SubmissionCounts> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(status = 'draft'), 0) AS draft,
         COALESCE(SUM(status = 'published'), 0) AS published,
         COALESCE(SUM(status = 'archived'), 0) AS archived
       FROM contents
       WHERE author_id IS NOT NULL`
    )
    .first<SubmissionCounts>();

  return {
    draft: row?.draft ?? 0,
    published: row?.published ?? 0,
    archived: row?.archived ?? 0
  };
}
