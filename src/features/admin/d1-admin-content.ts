import {
  collectionMembershipStatements,
  listCollectionIdsForContent
} from "../collections/d1-collections";
import { contentFingerprint, normalizeSlug } from "../content/content-lifecycle";
import { readContentFormat } from "../content/content-format";
import {
  contentKinds,
  contentThemes,
  type ContentFormat,
  type ContentKind,
  type ContentStatus,
  type ContentTheme
} from "../content/content.types";
import { adminJson } from "./admin-http";
import { pollOptionId } from "../interactions/content-polls";
import { isCatalogSlug } from "./catalog";
import type { AdminListQuery, ContentDraftInput } from "./content-draft";
import {
  encodeAdminCursor,
  likeContains,
  readingMinutes
} from "./content-draft";

export type ReviewReason = "topic";

export interface AdminListItem {
  id: string;
  title: string;
  description: string;
  category: string;
  format: ContentFormat;
  kind: ContentKind;
  theme: ContentTheme;
  status: ContentStatus;
  topics: string[];
  reviewReasons: ReviewReason[];
  createdAt: number;
  updatedAt: number;
}

export interface AdminStats {
  total: number;
  published: number;
  drafts: number;
  review: number;
}

export interface AdminCatalogItem {
  slug: string;
  label: string;
}

export interface AdminContent {
  id: string;
  slug: string;
  format: ContentFormat;
  kind: ContentKind;
  status: ContentStatus;
  category: string;
  title: string;
  description: string;
  tag: string;
  theme: ContentTheme;
  topics: string[];
  moods: string[];
  sourceLabel: string;
  sourceUrl: string;
  body: string;
  imageUrl: string;
  imageAlt: string;
  imageWidth: number | null;
  imageHeight: number | null;
  posterUrl: string;
  pollOptions: string[];
  collectionIds: string[];
  updatedAt: number;
  publishedAt: number | null;
}

export class AdminContentError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

interface ListRow {
  id: string;
  title: string;
  description: string;
  category: string;
  format: string;
  kind: string;
  theme: string;
  status: string;
  topics_csv: string | null;
  review_marks: string | null;
  created_at: number;
  updated_at: number;
}

interface DetailRow {
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
  updated_at: number;
  published_at: number | null;
  body_markdown: string | null;
  topics_csv: string | null;
  moods_csv: string | null;
}

interface CatalogRow {
  slug: string;
  label: string;
}

function known<T extends string>(
  value: string,
  allowed: readonly T[]
): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function splitCatalogSlugs(value: string | null): string[] {
  if (!value) return [];

  const chosen: string[] = [];

  for (const part of value.split(",")) {
    if (isCatalogSlug(part) && !chosen.includes(part)) chosen.push(part);
  }

  return chosen;
}

function mapDetail(row: DetailRow): AdminContent {
  const kind = known(row.kind, contentKinds);
  const theme = known(row.theme, contentThemes);
  const status = known(row.status, [
    "draft",
    "published",
    "archived"
  ] as const);

  if (!kind || !theme || !status) {
    throw new AdminContentError(500, "Không đọc được bài này.");
  }

  return {
    id: row.id,
    slug: row.slug,
    format: readContentFormat(row.format),
    kind,
    status,
    category: row.category,
    title: row.title,
    description: row.description,
    tag: row.tag,
    theme,
    topics: splitCatalogSlugs(row.topics_csv),
    moods: splitCatalogSlugs(row.moods_csv),
    sourceLabel: row.source_label ?? "",
    sourceUrl: row.source_url ?? "",
    body: row.body_markdown ?? "",
    imageUrl: "",
    imageAlt: "",
    imageWidth: null,
    imageHeight: null,
    posterUrl: "",
    pollOptions: [],
    collectionIds: [],
    updatedAt: row.updated_at,
    publishedAt: row.published_at
  };
}

const detailSql = `SELECT
  c.id, c.slug, c.format, c.kind, c.status, c.category, c.title,
  c.description, c.tag, c.theme, c.source_label, c.source_url,
  c.updated_at, c.published_at, d.body_markdown,
  (
    SELECT group_concat(topic_slug, ',')
    FROM content_topics
    WHERE content_id = c.id
  ) AS topics_csv,
  (
    SELECT group_concat(mood_slug, ',')
    FROM content_moods
    WHERE content_id = c.id
  ) AS moods_csv
FROM contents c
LEFT JOIN content_details d ON d.content_id = c.id
WHERE c.id = ?1`;

// Mo rong sau nay: them dieu kien "gan giong" vao cung predicate,
// khong doi mang reviewReasons.
const reviewPredicate = `NOT EXISTS (
  SELECT 1
  FROM content_topics review_topic
  WHERE review_topic.content_id = c.id
)`;

const reviewMarks = `TRIM(
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM content_topics review_topic
      WHERE review_topic.content_id = c.id
    )
    THEN 'topic '
    ELSE ''
  END
)`;

function orderColumn(sort: AdminListQuery["sort"]): string {
  return sort === "created" ? "c.created_at" : "c.updated_at";
}

function filterSql(): string {
  return `WHERE (?1 = 'all' OR c.status = ?1)
    AND (
      ?2 = ''
      OR c.title LIKE ?3 ESCAPE '\\'
      OR c.description LIKE ?3 ESCAPE '\\'
    )
    AND (?4 = '' OR c.kind = ?4)
    AND (
      ?5 = ''
      OR EXISTS (
        SELECT 1
        FROM content_topics filter_topic
        WHERE filter_topic.content_id = c.id
          AND filter_topic.topic_slug = ?5
      )
    )
    AND (?6 = 0 OR ${reviewPredicate})`;
}

function filterBindings(query: AdminListQuery): Array<string | number> {
  return [
    query.status,
    query.q,
    query.q ? likeContains(query.q) : "",
    query.kind,
    query.topic,
    query.review ? 1 : 0
  ];
}

function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? count : 0;
}

function reviewReasonsFrom(marks: string | null): ReviewReason[] {
  if (!marks) return [];

  const reasons: ReviewReason[] = [];

  for (const part of marks.split(" ")) {
    if (part === "topic" && !reasons.includes(part)) {
      reasons.push(part);
    }
  }

  return reasons;
}

export async function listAdminContents(
  db: D1Database,
  query: AdminListQuery
): Promise<{
  items: AdminListItem[];
  nextCursor: string | null;
  total: number;
  stats: AdminStats;
}> {
  const column = orderColumn(query.sort);
  const cursorAt = query.cursor?.at ?? -1;
  const cursorId = query.cursor?.id ?? "";
  const [page, totalRow, statsRow] = await Promise.all([
    db
      .prepare(
        `SELECT
           c.id, c.title, c.description, c.category, c.format, c.kind, c.theme,
           c.status, c.created_at, c.updated_at,
           (
             SELECT group_concat(ct.topic_slug, ',')
             FROM content_topics ct
             WHERE ct.content_id = c.id
           ) AS topics_csv,
           ${reviewMarks} AS review_marks
         FROM contents c
         ${filterSql()}
           AND (
             ?7 < 0
             OR ${column} < ?7
             OR (${column} = ?7 AND c.id < ?8)
           )
         ORDER BY ${column} DESC, c.id DESC
         LIMIT ?9`
      )
      .bind(
        ...filterBindings(query),
        cursorAt,
        cursorId,
        query.limit + 1
      )
      .all<ListRow>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM contents c
         ${filterSql()}`
      )
      .bind(...filterBindings(query))
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS published,
           COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) AS drafts,
           COALESCE(SUM(CASE
             WHEN NOT EXISTS (
               SELECT 1
               FROM content_topics review_topic
               WHERE review_topic.content_id = contents.id
             )
             THEN 1
             ELSE 0
           END), 0) AS review
         FROM contents`
      )
      .first<{
        total: number;
        published: number;
        drafts: number;
        review: number;
      }>()
  ]);

  const rows = page.results ?? [];
  const visible = rows.slice(0, query.limit);
  const items: AdminListItem[] = [];

  for (const row of visible) {
    const kind = known(row.kind, contentKinds);
    const theme = known(row.theme, contentThemes);
    const status = known(row.status, [
      "draft",
      "published",
      "archived"
    ] as const);

    if (!kind || !theme || !status) continue;

    items.push({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      format: readContentFormat(row.format),
      kind,
      theme,
      status,
      topics: splitCatalogSlugs(row.topics_csv),
      reviewReasons: reviewReasonsFrom(row.review_marks),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  const last = visible.at(-1);
  const nextCursor =
    rows.length > query.limit && last
      ? encodeAdminCursor(
          query.sort,
          query.sort === "created" ? last.created_at : last.updated_at,
          last.id
        )
      : null;

  return {
    items,
    nextCursor,
    total: asCount(totalRow?.n),
    stats: {
      total: asCount(statsRow?.total),
      published: asCount(statsRow?.published),
      drafts: asCount(statsRow?.drafts),
      review: asCount(statsRow?.review)
    }
  };
}

export async function loadAdminCatalog(
  db: D1Database
): Promise<{
  topics: AdminCatalogItem[];
  moods: AdminCatalogItem[];
}> {
  const [topics, moods] = await Promise.all([
    db
      .prepare(
        `SELECT slug, label
         FROM topics
         ORDER BY sort_order, slug`
      )
      .all<CatalogRow>(),
    db
      .prepare(
        `SELECT slug, label
         FROM moods
         ORDER BY sort_order, slug`
      )
      .all<CatalogRow>()
  ]);

  return {
    topics: (topics.results ?? [])
      .filter((row) => isCatalogSlug(row.slug))
      .map((row) => ({ slug: row.slug, label: row.label })),
    moods: (moods.results ?? [])
      .filter((row) => isCatalogSlug(row.slug))
      .map((row) => ({ slug: row.slug, label: row.label }))
  };
}

export async function getAdminContent(
  db: D1Database,
  id: string
): Promise<AdminContent | null> {
  const row = await db
    .prepare(detailSql)
    .bind(id)
    .first<DetailRow>();

  if (!row) return null;

  const detail = mapDetail(row);
  const [pollRows, media, collectionIds] = await Promise.all([
    db
      .prepare(
        `SELECT label
         FROM poll_options
         WHERE content_id = ?1
         ORDER BY sort_order, option_id`
      )
      .bind(id)
      .all<{ label: string }>(),
    db
      .prepare(
        `SELECT url, alt, poster_url, width, height
         FROM content_media
         WHERE content_id = ?1
         LIMIT 1`
      )
      .bind(id)
      .first<{
        url: string;
        alt: string;
        poster_url: string | null;
        width: number | null;
        height: number | null;
      }>(),
    listCollectionIdsForContent(db, id)
  ]);

  return {
    ...detail,
    imageUrl: media?.url ?? "",
    imageAlt: media?.alt ?? "",
    imageWidth: media?.width ?? null,
    imageHeight: media?.height ?? null,
    posterUrl: media?.poster_url ?? "",
    pollOptions: pollRows.results.map((item) => item.label),
    collectionIds
  };
}

function createContentId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);

  return `c${[...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function nextSlug(
  db: D1Database,
  title: string,
  currentSlug: string
): Promise<string> {
  let base = "";

  try {
    base = normalizeSlug(title).slice(0, 72);
  } catch {
    throw new AdminContentError(400, "Hãy nhập câu chữ chính.");
  }

  if (
    currentSlug === base ||
    currentSlug.startsWith(`${base}-`)
  ) {
    return currentSlug;
  }

  const taken = await db
    .prepare(
      `SELECT slug
       FROM contents
       WHERE slug = ?1 OR slug LIKE ?2 ESCAPE '\\'
       LIMIT 40`
    )
    .bind(base, `${base}-%`)
    .all<{ slug: string }>();

  const slugs = new Set(
    (taken.results ?? []).map((row) => row.slug)
  );

  if (!slugs.has(base)) return base;

  for (let suffix = 2; suffix <= 40; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!slugs.has(candidate)) return candidate;
  }

  return `${base}-${createContentId().slice(1, 7)}`;
}

async function ensureUniqueHash(
  db: D1Database,
  draft: ContentDraftInput,
  selfId: string
): Promise<string> {
  const hash = await contentFingerprint([
    draft.title,
    draft.description,
    draft.body
  ]);

  const existing = await db
    .prepare(
      `SELECT id
       FROM contents
       WHERE normalized_hash = ?1
         AND id != ?2
       LIMIT 1`
    )
    .bind(hash, selfId)
    .first<{ id: string }>();

  if (existing) {
    throw new AdminContentError(
      409,
      "Đã có một bài với cùng câu chữ."
    );
  }

  return hash;
}

function isConstraint(error: unknown): boolean {
  return error instanceof Error && /UNIQUE/i.test(error.message);
}

function childStatements(
  db: D1Database,
  id: string,
  draft: ContentDraftInput
): D1PreparedStatement[] {
  const statements = [
    db
      .prepare(
        `DELETE FROM content_topics WHERE content_id = ?1`
      )
      .bind(id),
    db
      .prepare(
        `DELETE FROM content_moods WHERE content_id = ?1`
      )
      .bind(id),
    db
      .prepare(
        `DELETE FROM content_details WHERE content_id = ?1`
      )
      .bind(id),
    db
      .prepare(
        `DELETE FROM poll_options WHERE content_id = ?1`
      )
      .bind(id),
    db
      .prepare(
        `DELETE FROM content_media WHERE content_id = ?1`
      )
      .bind(id)
  ];

  for (const topic of draft.topics) {
    statements.push(
      db
        .prepare(
          `INSERT INTO content_topics (content_id, topic_slug)
           VALUES (?1, ?2)`
        )
        .bind(id, topic)
    );
  }

  for (const mood of draft.moods) {
    statements.push(
      db
        .prepare(
          `INSERT INTO content_moods (content_id, mood_slug)
           VALUES (?1, ?2)`
        )
        .bind(id, mood)
    );
  }

  if (
    (draft.format === "text" ||
      draft.format === "image" ||
      draft.format === "video" ||
      draft.format === "prompt") &&
    draft.body
  ) {
    statements.push(
      db
        .prepare(
          `INSERT INTO content_details (
             content_id, body_markdown, reading_minutes
           )
           VALUES (?1, ?2, ?3)`
        )
        .bind(id, draft.body, readingMinutes(draft.body))
    );
  }

  if (
    (draft.format === "image" || draft.format === "video") &&
    draft.imageUrl
  ) {
    statements.push(
      db
        .prepare(
          `INSERT INTO content_media (
             content_id, kind, url, alt, poster_url, width, height
           )
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        )
        .bind(
          id,
          draft.format === "video" ? "video" : "image",
          draft.imageUrl,
          draft.imageAlt,
          draft.format === "video" && draft.posterUrl
            ? draft.posterUrl
            : null,
          draft.imageWidth,
          draft.imageHeight
        )
    );
  }

  if (draft.format === "poll") {
    draft.pollOptions.forEach((label, index) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO poll_options (
               content_id, option_id, label, sort_order
             )
             VALUES (?1, ?2, ?3, ?4)`
          )
          .bind(id, pollOptionId(index), label, index)
      );
    });
  }

  statements.push(
    ...collectionMembershipStatements(db, id, draft.collectionIds)
  );

  return statements;
}

export async function createAdminContent(
  db: D1Database,
  draft: ContentDraftInput,
  now: number,
  authorId: string | null = null
): Promise<AdminContent> {
  const id = createContentId();
  const slug = await nextSlug(db, draft.title, "");
  const hash = await ensureUniqueHash(db, draft, id);

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO contents (
             id, slug, format, kind, status, category, title, description, tag,
             theme, source_label, source_url, normalized_hash,
             created_at, updated_at, published_at, author_id
           )
           VALUES (
             ?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?7, ?8,
             ?9, ?10, ?11, ?12, ?13, ?13, NULL, ?14
           )`
        )
        .bind(
          id,
          slug,
          draft.format,
          draft.kind,
          draft.category,
          draft.title,
          draft.description,
          draft.tag,
          draft.theme,
          draft.sourceLabel || null,
          draft.sourceUrl || null,
          hash,
          now,
          authorId
        ),
      ...childStatements(db, id, draft)
    ]);
  } catch (error) {
    if (isConstraint(error)) {
      throw new AdminContentError(
        409,
        "Đã có một bài với cùng câu chữ hoặc đường dẫn."
      );
    }

    throw error;
  }

  const created = await getAdminContent(db, id);

  if (!created) {
    throw new AdminContentError(500, "Không lưu được bài.");
  }

  return created;
}

/** authorId: nguoi viet tu sua, chi duoc khi bai cua ho va con cho duyet. */
export async function updateAdminContent(
  db: D1Database,
  id: string,
  draft: ContentDraftInput,
  now: number,
  authorId: string | null = null
): Promise<AdminContent> {
  const current = await getAdminContent(db, id);

  if (!current) {
    throw new AdminContentError(404, "Không tìm thấy bài.");
  }

  if (authorId && current.status !== "draft") {
    throw new AdminContentError(
      409,
      "Bài đã được duyệt nên không sửa được nữa."
    );
  }

  if (current.status === "archived") {
    throw new AdminContentError(
      409,
      "Bài đã lưu trữ nên không sửa được."
    );
  }

  const slug = await nextSlug(db, draft.title, current.slug);
  const hash = await ensureUniqueHash(db, draft, id);
  let updated;

  try {
    updated = await db
      .prepare(
        `UPDATE contents
         SET slug = ?1,
             format = ?2,
             kind = ?3,
             category = ?4,
             title = ?5,
             description = ?6,
             tag = ?7,
             theme = ?8,
             source_label = ?9,
             source_url = ?10,
             normalized_hash = ?11,
             updated_at = ?12
         WHERE id = ?13
           AND status != 'archived'
           AND (?14 IS NULL OR (author_id = ?14 AND status = 'draft'))`
      )
      .bind(
        slug,
        draft.format,
        draft.kind,
        draft.category,
        draft.title,
        draft.description,
        draft.tag,
        draft.theme,
        draft.sourceLabel || null,
        draft.sourceUrl || null,
        hash,
        now,
        id,
        authorId
      )
      .run();
  } catch (error) {
    if (isConstraint(error)) {
      throw new AdminContentError(
        409,
        "Đã có một bài với cùng câu chữ hoặc đường dẫn."
      );
    }

    throw error;
  }

  if ((updated.meta.changes ?? 0) !== 1) {
    throw new AdminContentError(
      409,
      "Bài đã đổi trạng thái. Hãy mở lại."
    );
  }

  try {
    await db.batch(childStatements(db, id, draft));
  } catch (error) {
    if (isConstraint(error)) {
      throw new AdminContentError(
        409,
        "Đã có một bài với cùng câu chữ hoặc đường dẫn."
      );
    }

    throw error;
  }

  const saved = await getAdminContent(db, id);

  if (!saved) {
    throw new AdminContentError(500, "Không lưu được bài.");
  }

  return saved;
}

/** Xoa bai khoi DB (CASCADE sang bang con). Tra ve false neu khong tim thay. */
export async function deleteAdminContent(
  db: D1Database,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM contents WHERE id = ?1`)
    .bind(id)
    .run();

  return (result.meta.changes ?? 0) === 1;
}

export function respondAdminError(error: unknown): Response {
  if (error instanceof AdminContentError) {
    return adminJson(
      { success: false, error: error.message },
      error.statusCode
    );
  }

  console.error("Admin content error:", error);

  return adminJson(
    { success: false, error: "Không lưu được bài." },
    500
  );
}
