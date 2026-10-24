import { mediaKeyFromPath, parseMediaUrl } from "../media/media-ref";

export interface AmbientTrackRow {
  id: string;
  title: string;
  url: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: number;
}

interface DbRow {
  id: string;
  title: string;
  url: string;
  sort_order: number;
  is_default: number;
  created_at: number;
}

function mapRow(row: DbRow): AmbientTrackRow {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    sortOrder: row.sort_order,
    isDefault: row.is_default === 1,
    createdAt: row.created_at
  };
}

const LIST_SQL = `SELECT id, title, url, sort_order, is_default, created_at
  FROM ambient_tracks
  ORDER BY sort_order ASC, created_at ASC`;

export async function listAmbientTracks(
  db: D1Database
): Promise<AmbientTrackRow[]> {
  const result = await db.prepare(LIST_SQL).all<DbRow>();
  return (result.results ?? []).map(mapRow);
}

export async function getAmbientTrack(
  db: D1Database,
  id: string
): Promise<AmbientTrackRow | null> {
  const row = await db
    .prepare(
      `SELECT id, title, url, sort_order, is_default, created_at
       FROM ambient_tracks WHERE id = ?1 LIMIT 1`
    )
    .bind(id)
    .first<DbRow>();
  return row ? mapRow(row) : null;
}

export function normalizeAmbientTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  if (title.length < 1 || title.length > 80) return null;
  return title;
}

/** Chi chap nhan URL local /api/media/audio/... */
export function normalizeAmbientAudioUrl(value: unknown): string | null {
  const parsed = parseMediaUrl(value);
  if (!parsed) return null;
  const key = mediaKeyFromPath(parsed);
  if (!key || !key.startsWith("audio/")) return null;
  return parsed;
}

export async function insertAmbientTrack(
  db: D1Database,
  input: {
    title: string;
    url: string;
    makeDefault?: boolean;
  }
): Promise<AmbientTrackRow> {
  const id = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);
  const sortRow = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM ambient_tracks`)
    .first<{ max_sort: number }>();
  const sortOrder = (sortRow?.max_sort ?? -1) + 1;

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM ambient_tracks`)
    .first<{ n: number }>();
  const isFirst = (countRow?.n ?? 0) === 0;
  const isDefault = input.makeDefault === true || isFirst ? 1 : 0;

  if (isDefault === 1) {
    await db.prepare(`UPDATE ambient_tracks SET is_default = 0`).run();
  }

  await db
    .prepare(
      `INSERT INTO ambient_tracks (id, title, url, sort_order, is_default, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
    .bind(id, input.title, input.url, sortOrder, isDefault, createdAt)
    .run();

  const created = await getAmbientTrack(db, id);
  if (!created) throw new Error("ambient_track_insert_failed");
  return created;
}

export async function updateAmbientTrackTitle(
  db: D1Database,
  id: string,
  title: string
): Promise<AmbientTrackRow | null> {
  const result = await db
    .prepare(`UPDATE ambient_tracks SET title = ?1 WHERE id = ?2`)
    .bind(title, id)
    .run();
  if (!result.meta.changes) return null;
  return getAmbientTrack(db, id);
}

export async function setDefaultAmbientTrack(
  db: D1Database,
  id: string
): Promise<AmbientTrackRow | null> {
  const existing = await getAmbientTrack(db, id);
  if (!existing) return null;

  await db.batch([
    db.prepare(`UPDATE ambient_tracks SET is_default = 0`),
    db.prepare(`UPDATE ambient_tracks SET is_default = 1 WHERE id = ?1`).bind(id)
  ]);

  return getAmbientTrack(db, id);
}

export async function deleteAmbientTrack(
  db: D1Database,
  id: string
): Promise<AmbientTrackRow | null> {
  const existing = await getAmbientTrack(db, id);
  if (!existing) return null;

  await db.prepare(`DELETE FROM ambient_tracks WHERE id = ?1`).bind(id).run();

  if (existing.isDefault) {
    const next = await db
      .prepare(
        `SELECT id FROM ambient_tracks
         ORDER BY sort_order ASC, created_at ASC
         LIMIT 1`
      )
      .first<{ id: string }>();
    if (next) {
      await db
        .prepare(`UPDATE ambient_tracks SET is_default = 1 WHERE id = ?1`)
        .bind(next.id)
        .run();
    }
  }

  return existing;
}
