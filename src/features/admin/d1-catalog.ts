export interface CatalogEntry {
  slug: string;
  label: string;
  sortOrder: number;
  used: number;
}

interface CatalogRow {
  slug: string;
  label: string;
  sort_order: number;
  used: number;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapRow(row: CatalogRow): CatalogEntry {
  return {
    slug: row.slug,
    label: row.label,
    sortOrder: row.sort_order,
    used: asCount(row.used)
  };
}

const topicSql = `SELECT slug, label, sort_order,
  (SELECT COUNT(*) FROM content_topics WHERE topic_slug = topics.slug) AS used
  FROM topics
  ORDER BY sort_order, slug`;

const moodSql = `SELECT slug, label, sort_order,
  (SELECT COUNT(*) FROM content_moods WHERE mood_slug = moods.slug) AS used
  FROM moods
  ORDER BY sort_order, slug`;

export async function listCatalog(db: D1Database): Promise<{
  topics: CatalogEntry[];
  moods: CatalogEntry[];
}> {
  const [topics, moods] = await Promise.all([
    db.prepare(topicSql).all<CatalogRow>(),
    db.prepare(moodSql).all<CatalogRow>()
  ]);

  return {
    topics: (topics.results ?? []).map(mapRow),
    moods: (moods.results ?? []).map(mapRow)
  };
}

const topicUpdate = `UPDATE topics SET label = ?, sort_order = ? WHERE slug = ?`;
const moodUpdate = `UPDATE moods SET label = ?, sort_order = ? WHERE slug = ?`;
const topicOne = `SELECT slug, label, sort_order,
  (SELECT COUNT(*) FROM content_topics WHERE topic_slug = topics.slug) AS used
  FROM topics
  WHERE slug = ?`;
const moodOne = `SELECT slug, label, sort_order,
  (SELECT COUNT(*) FROM content_moods WHERE mood_slug = moods.slug) AS used
  FROM moods
  WHERE slug = ?`;

export async function updateCatalogEntry(
  db: D1Database,
  kind: "topic" | "mood",
  slug: string,
  label: string,
  sortOrder: number
): Promise<CatalogEntry | null> {
  const current = await db
    .prepare(kind === "topic" ? topicOne : moodOne)
    .bind(slug)
    .first<CatalogRow>();

  if (!current) return null;

  await db
    .prepare(kind === "topic" ? topicUpdate : moodUpdate)
    .bind(label, sortOrder, slug)
    .run();

  const row = await db
    .prepare(kind === "topic" ? topicOne : moodOne)
    .bind(slug)
    .first<CatalogRow>();

  return row ? mapRow(row) : null;
}

const topicInsert = `INSERT INTO topics (slug, label, sort_order) VALUES (?, ?, ?)`;
const moodInsert = `INSERT INTO moods (slug, label, sort_order) VALUES (?, ?, ?)`;
const topicMaxOrder = `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM topics`;
const moodMaxOrder = `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM moods`;

export type CatalogCreateResult =
  | { ok: true; item: CatalogEntry }
  | { ok: false; conflict: boolean };

export async function createCatalogEntry(
  db: D1Database,
  kind: "topic" | "mood",
  slug: string,
  label: string
): Promise<CatalogCreateResult> {
  const maxRow = await db
    .prepare(kind === "topic" ? topicMaxOrder : moodMaxOrder)
    .first<{ max_order: number }>();

  const sortOrder = Math.min(
    999,
    (typeof maxRow?.max_order === "number" ? maxRow.max_order : -1) + 1
  );

  try {
    await db
      .prepare(kind === "topic" ? topicInsert : moodInsert)
      .bind(slug, label, sortOrder)
      .run();
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message)) {
      return { ok: false, conflict: true };
    }
    throw error;
  }

  const row = await db
    .prepare(kind === "topic" ? topicOne : moodOne)
    .bind(slug)
    .first<CatalogRow>();

  if (!row) {
    return { ok: false, conflict: false };
  }

  return { ok: true, item: mapRow(row) };
}
