import { CONTENT_ID_PATTERN } from "../admin/admin-http";
import { normalizeSlug } from "../content/content-lifecycle";

export type CollectionStatus = "draft" | "published" | "archived";

export interface CollectionSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: CollectionStatus;
  sortOrder: number;
  itemCount: number;
  publishedCount: number;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

export interface CollectionItemRef {
  contentId: string;
  title: string;
  status: string;
  format: string;
  sortOrder: number;
}

export interface CollectionDetail extends CollectionSummary {
  items: CollectionItemRef[];
}

export interface CollectionDraftInput {
  title: string;
  slug: string;
  description: string;
  status: CollectionStatus;
  sortOrder: number;
}

interface CollectionRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  item_count: number | null;
  published_count: number | null;
}

const STATUSES: readonly CollectionStatus[] = [
  "draft",
  "published",
  "archived"
];

export class CollectionError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function asCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function knownStatus(value: string): CollectionStatus | null {
  return STATUSES.includes(value as CollectionStatus)
    ? (value as CollectionStatus)
    : null;
}

function mapSummary(row: CollectionRow): CollectionSummary {
  const status = knownStatus(row.status);
  if (!status) {
    throw new CollectionError(500, "Không đọc được bộ sưu tập.");
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status,
    sortOrder: row.sort_order,
    itemCount: asCount(row.item_count),
    publishedCount: asCount(row.published_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at
  };
}

function createCollectionId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `k${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function normalizeCollectionTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  if (title.length < 1 || title.length > 120) return null;
  return title;
}

export function normalizeCollectionDescription(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > 400) return null;
  return text;
}

export function normalizeCollectionSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  try {
    const slug = normalizeSlug(raw).slice(0, 80);
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
    return slug;
  } catch {
    return null;
  }
}

export function slugFromTitle(title: string): string {
  try {
    return normalizeSlug(title).slice(0, 80);
  } catch {
    return `bo-${createCollectionId().slice(1, 9)}`;
  }
}

export function parseCollectionDraft(
  input: unknown
): { ok: true; value: CollectionDraftInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Yêu cầu không đọc được." };
  }

  const source = input as Record<string, unknown>;
  const title = normalizeCollectionTitle(source.title);
  if (!title) {
    return { ok: false, error: "Tên bộ 1–120 ký tự." };
  }

  const slugRaw =
    typeof source.slug === "string" && source.slug.trim()
      ? source.slug
      : title;
  const slug = normalizeCollectionSlug(slugRaw);
  if (!slug) {
    return { ok: false, error: "Đường dẫn không hợp lệ." };
  }

  const description = normalizeCollectionDescription(source.description);
  if (description === null) {
    return { ok: false, error: "Mô tả tối đa 400 ký tự." };
  }

  const status = oneOfStatus(source.status) ?? "draft";

  let sortOrder = 0;
  if (source.sortOrder !== undefined && source.sortOrder !== null) {
    const n = Number(source.sortOrder);
    if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000) {
      return { ok: false, error: "Thứ tự không hợp lệ." };
    }
    sortOrder = n;
  }

  return {
    ok: true,
    value: { title, slug, description, status, sortOrder }
  };
}

function oneOfStatus(value: unknown): CollectionStatus | null {
  if (typeof value !== "string") return null;
  return knownStatus(value);
}

/** Danh sach admin: moi status. */
export async function listCollectionsAdmin(
  db: D1Database
): Promise<CollectionSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT
         c.id, c.slug, c.title, c.description, c.status, c.sort_order,
         c.created_at, c.updated_at, c.published_at,
         (
           SELECT COUNT(*) FROM collection_contents cc
           WHERE cc.collection_id = c.id
         ) AS item_count,
         (
           SELECT COUNT(*)
           FROM collection_contents cc
           JOIN contents x ON x.id = cc.content_id
           WHERE cc.collection_id = c.id
             AND x.status = 'published'
             AND x.published_at IS NOT NULL
         ) AS published_count
       FROM collections c
       ORDER BY c.sort_order ASC, c.updated_at DESC, c.id ASC`
    )
    .all<CollectionRow>();

  return (results ?? []).map(mapSummary);
}

/** Public: chi published, dem bai published. */
export async function listCollectionsPublic(
  db: D1Database
): Promise<CollectionSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT
         c.id, c.slug, c.title, c.description, c.status, c.sort_order,
         c.created_at, c.updated_at, c.published_at,
         (
           SELECT COUNT(*)
           FROM collection_contents cc
           JOIN contents x ON x.id = cc.content_id
           WHERE cc.collection_id = c.id
             AND x.status = 'published'
             AND x.published_at IS NOT NULL
         ) AS item_count,
         (
           SELECT COUNT(*)
           FROM collection_contents cc
           JOIN contents x ON x.id = cc.content_id
           WHERE cc.collection_id = c.id
             AND x.status = 'published'
             AND x.published_at IS NOT NULL
         ) AS published_count
       FROM collections c
       WHERE c.status = 'published'
         AND c.published_at IS NOT NULL
       ORDER BY c.sort_order ASC, c.published_at DESC, c.id ASC`
    )
    .all<CollectionRow>();

  return (results ?? []).map(mapSummary);
}

export async function getCollectionById(
  db: D1Database,
  id: string
): Promise<CollectionDetail | null> {
  const row = await db
    .prepare(
      `SELECT
         c.id, c.slug, c.title, c.description, c.status, c.sort_order,
         c.created_at, c.updated_at, c.published_at,
         (
           SELECT COUNT(*) FROM collection_contents cc
           WHERE cc.collection_id = c.id
         ) AS item_count,
         (
           SELECT COUNT(*)
           FROM collection_contents cc
           JOIN contents x ON x.id = cc.content_id
           WHERE cc.collection_id = c.id
             AND x.status = 'published'
             AND x.published_at IS NOT NULL
         ) AS published_count
       FROM collections c
       WHERE c.id = ?1
       LIMIT 1`
    )
    .bind(id)
    .first<CollectionRow>();

  if (!row) return null;

  const items = await listCollectionItems(db, id);
  return { ...mapSummary(row), items };
}

export async function getCollectionBySlug(
  db: D1Database,
  slug: string,
  opts: { publicOnly?: boolean } = {}
): Promise<CollectionDetail | null> {
  const row = await db
    .prepare(
      `SELECT
         c.id, c.slug, c.title, c.description, c.status, c.sort_order,
         c.created_at, c.updated_at, c.published_at,
         (
           SELECT COUNT(*)
           FROM collection_contents cc
           JOIN contents x ON x.id = cc.content_id
           WHERE cc.collection_id = c.id
             AND (
               ?2 = 0
               OR (
                 x.status = 'published'
                 AND x.published_at IS NOT NULL
               )
             )
         ) AS item_count,
         (
           SELECT COUNT(*)
           FROM collection_contents cc
           JOIN contents x ON x.id = cc.content_id
           WHERE cc.collection_id = c.id
             AND x.status = 'published'
             AND x.published_at IS NOT NULL
         ) AS published_count
       FROM collections c
       WHERE c.slug = ?1
         AND (?2 = 0 OR (c.status = 'published' AND c.published_at IS NOT NULL))
       LIMIT 1`
    )
    .bind(slug, opts.publicOnly ? 1 : 0)
    .first<CollectionRow>();

  if (!row) return null;

  const items = opts.publicOnly
    ? []
    : await listCollectionItems(db, row.id);

  return { ...mapSummary(row), items };
}

async function listCollectionItems(
  db: D1Database,
  collectionId: string
): Promise<CollectionItemRef[]> {
  const { results } = await db
    .prepare(
      `SELECT
         cc.content_id AS content_id,
         cc.sort_order AS sort_order,
         x.title AS title,
         x.status AS status,
         x.format AS format
       FROM collection_contents cc
       JOIN contents x ON x.id = cc.content_id
       WHERE cc.collection_id = ?1
       ORDER BY cc.sort_order ASC, cc.content_id ASC`
    )
    .bind(collectionId)
    .all<{
      content_id: string;
      sort_order: number;
      title: string;
      status: string;
      format: string;
    }>();

  return (results ?? []).map((row) => ({
    contentId: row.content_id,
    title: row.title,
    status: row.status,
    format: row.format,
    sortOrder: row.sort_order
  }));
}

export async function createCollection(
  db: D1Database,
  draft: CollectionDraftInput,
  now: number
): Promise<CollectionDetail> {
  const id = createCollectionId();
  const publishedAt = draft.status === "published" ? now : null;

  try {
    await db
      .prepare(
        `INSERT INTO collections (
           id, slug, title, description, status, sort_order,
           created_at, updated_at, published_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8)`
      )
      .bind(
        id,
        draft.slug,
        draft.title,
        draft.description,
        draft.status,
        draft.sortOrder,
        now,
        publishedAt
      )
      .run();
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message)) {
      throw new CollectionError(409, "Đường dẫn bộ sưu tập đã dùng.");
    }
    throw error;
  }

  const created = await getCollectionById(db, id);
  if (!created) throw new CollectionError(500, "Không tạo được bộ.");
  return created;
}

export async function updateCollection(
  db: D1Database,
  id: string,
  draft: CollectionDraftInput,
  now: number
): Promise<CollectionDetail> {
  const existing = await getCollectionById(db, id);
  if (!existing) throw new CollectionError(404, "Không tìm thấy bộ.");

  let publishedAt = existing.publishedAt;
  if (draft.status === "published") {
    publishedAt = publishedAt ?? now;
  } else if (draft.status === "draft") {
    publishedAt = null;
  }

  try {
    await db
      .prepare(
        `UPDATE collections
         SET slug = ?2,
             title = ?3,
             description = ?4,
             status = ?5,
             sort_order = ?6,
             updated_at = ?7,
             published_at = ?8
         WHERE id = ?1`
      )
      .bind(
        id,
        draft.slug,
        draft.title,
        draft.description,
        draft.status,
        draft.sortOrder,
        now,
        publishedAt
      )
      .run();
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message)) {
      throw new CollectionError(409, "Đường dẫn bộ sưu tập đã dùng.");
    }
    throw error;
  }

  const updated = await getCollectionById(db, id);
  if (!updated) throw new CollectionError(500, "Không lưu được bộ.");
  return updated;
}

/**
 * Archive neu con thanh vien; xoa that khi rong.
 */
export async function deleteCollection(
  db: D1Database,
  id: string,
  now: number
): Promise<{ archived: boolean } | null> {
  const existing = await getCollectionById(db, id);
  if (!existing) return null;

  if (existing.itemCount > 0) {
    await db
      .prepare(
        `UPDATE collections
         SET status = 'archived', updated_at = ?2
         WHERE id = ?1`
      )
      .bind(id, now)
      .run();
    return { archived: true };
  }

  await db.prepare(`DELETE FROM collections WHERE id = ?1`).bind(id).run();
  return { archived: false };
}

/** Thay toan bo thanh vien theo thu tu. */
export async function setCollectionItems(
  db: D1Database,
  collectionId: string,
  contentIds: string[],
  now: number
): Promise<CollectionDetail> {
  const existing = await getCollectionById(db, collectionId);
  if (!existing) throw new CollectionError(404, "Không tìm thấy bộ.");

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of contentIds) {
    if (typeof id !== "string" || !CONTENT_ID_PATTERN.test(id)) {
      throw new CollectionError(400, "Mã bài không hợp lệ.");
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  if (ordered.length > 0) {
    const slots = ordered.map((_, i) => `?${i + 1}`).join(", ");
    const found = await db
      .prepare(
        `SELECT id FROM contents WHERE id IN (${slots})`
      )
      .bind(...ordered)
      .all<{ id: string }>();

    if ((found.results ?? []).length !== ordered.length) {
      throw new CollectionError(400, "Có bài không tồn tại.");
    }
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(`DELETE FROM collection_contents WHERE collection_id = ?1`)
      .bind(collectionId)
  ];

  ordered.forEach((contentId, index) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO collection_contents (collection_id, content_id, sort_order)
           VALUES (?1, ?2, ?3)`
        )
        .bind(collectionId, contentId, index)
    );
  });

  statements.push(
    db
      .prepare(`UPDATE collections SET updated_at = ?2 WHERE id = ?1`)
      .bind(collectionId, now)
  );

  await db.batch(statements);

  const updated = await getCollectionById(db, collectionId);
  if (!updated) throw new CollectionError(500, "Không lưu được danh sách.");
  return updated;
}

/** Ids bo ma bai dang thuoc (admin form). */
export async function listCollectionIdsForContent(
  db: D1Database,
  contentId: string
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT collection_id
       FROM collection_contents
       WHERE content_id = ?1
       ORDER BY collection_id`
    )
    .bind(contentId)
    .all<{ collection_id: string }>();

  return (results ?? []).map((row) => row.collection_id);
}

/**
 * Gan bai vao cac bo: xoa membership cu, chen cuoi moi bo.
 */
export function collectionMembershipStatements(
  db: D1Database,
  contentId: string,
  collectionIds: string[]
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(`DELETE FROM collection_contents WHERE content_id = ?1`)
      .bind(contentId)
  ];

  const unique = [...new Set(collectionIds)].filter((id) =>
    CONTENT_ID_PATTERN.test(id)
  );

  for (const collectionId of unique) {
    statements.push(
      db
        .prepare(
          `INSERT INTO collection_contents (collection_id, content_id, sort_order)
           SELECT ?1, ?2, COALESCE(MAX(sort_order), -1) + 1
           FROM collection_contents
           WHERE collection_id = ?1`
        )
        .bind(collectionId, contentId)
    );
  }

  return statements;
}

export function parseCollectionIdList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !CONTENT_ID_PATTERN.test(item)) {
      return null;
    }
    if (!ids.includes(item)) ids.push(item);
  }
  return ids;
}
