import { hashSessionToken, readSessionToken } from "../account/account";
import { readActorId } from "../actor/actor";
import { isContentTopic, type ContentTopic } from "../content/content.types";
import { mergeViewerStates } from "./merge-viewer-state";
import { markSeen, seenBlob, toSeenBits } from "./seen-bits";
import {
  applySeenReport,
  freshBase,
  type SeenBase,
  type SeenReport,
  type SeenTarget
} from "./seen-report";
import { actorViewerKey, resolveViewerKey, userViewerKey } from "./viewer-key";
import { parsePositions } from "./viewer-positions";

export interface ViewerState {
  key: string;
  seen: Uint8Array;
  seenCount: number;
  positions: Map<string, string>;
  freshAt: number;
  loopCount: number;
  version: number;
}

/** Ai dang xem feed. state = null khi nguoi nay chua tung bao da xem bai nao. */
export interface FeedViewer {
  key: string | null;
  userId: string | null;
  actorId: string | null;
  favorites: ContentTopic[];
  state: ViewerState | null;
}

export const ANONYMOUS_VIEWER: FeedViewer = {
  key: null,
  userId: null,
  actorId: null,
  favorites: [],
  state: null
};

interface SessionRow {
  user_id: string;
  topics_json: string;
}

export interface ViewerStateRow {
  viewer_key: string;
  seen_bits: unknown;
  seen_count: number;
  positions_json: string;
  fresh_at: number;
  loop_count: number;
  version: number;
}

export const VIEWER_STATE_COLUMNS = `
  viewer_key,
  seen_bits,
  seen_count,
  positions_json,
  fresh_at,
  loop_count,
  version`;

export function toViewerState(row: ViewerStateRow): ViewerState {
  return {
    key: row.viewer_key,
    seen: toSeenBits(row.seen_bits),
    seenCount: row.seen_count,
    positions: parsePositions(row.positions_json),
    freshAt: row.fresh_at,
    loopCount: row.loop_count,
    version: row.version
  };
}

function readTopics(json: string | undefined): ContentTopic[] {
  try {
    const value: unknown = JSON.parse(json ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (topic): topic is ContentTopic =>
            typeof topic === "string" && isContentTopic(topic)
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * Mot batch: phien dang nhap (kem chu de yeu thich) va dong trang thai.
 * Khoa trang thai tinh ngay trong SQL: tai khoan neu phien con han,
 * khong thi ma an danh. Khong co cookie nao thi khong goi DB.
 */
export async function readFeedViewer(
  db: D1Database,
  cookieHeader: string | null,
  now: number
): Promise<FeedViewer> {
  const token = readSessionToken(cookieHeader);
  const actorId = readActorId(cookieHeader);

  if (!token && !actorId) return ANONYMOUS_VIEWER;

  const tokenHash = token ? await hashSessionToken(token) : null;
  const [sessionResult, stateResult] = await db.batch([
    db
      .prepare(
        `SELECT
           s.user_id,
           (
             SELECT json_group_array(ut.topic_slug)
             FROM user_topics ut
             WHERE ut.user_id = s.user_id
           ) AS topics_json
         FROM user_sessions s
         WHERE s.token_hash = ?1 AND s.expires_at > ?2`
      )
      .bind(tokenHash, now),
    db
      .prepare(
        `SELECT ${VIEWER_STATE_COLUMNS}
         FROM viewer_feed_state
         WHERE viewer_key = COALESCE(
           (
             SELECT 'u:' || s.user_id
             FROM user_sessions s
             WHERE s.token_hash = ?1 AND s.expires_at > ?2
           ),
           ?3
         )`
      )
      .bind(tokenHash, now, actorId ? `a:${actorId}` : null)
  ]);

  const session = sessionResult?.results[0] as SessionRow | undefined;
  const userId = session?.user_id ?? null;
  const key = resolveViewerKey({ userId, actorId });
  const row = stateResult?.results[0] as ViewerStateRow | undefined;

  return {
    key,
    userId,
    actorId,
    favorites: readTopics(session?.topics_json),
    // Ma tai khoan khong hop le thi SQL va JS chon khoa khac nhau; bo trang thai.
    state: row && row.viewer_key === key ? toViewerState(row) : null
  };
}

/** Bai nguoi nay da thich hoac da luu: khong dua lai vao feed chinh. */
async function readKeptBits(
  db: D1Database,
  userId: string | null,
  actorId: string | null
): Promise<{ bits: Uint8Array; added: number }> {
  if (!userId && !actorId) return { bits: new Uint8Array(0), added: 0 };

  const { results } = await db
    .prepare(
      `SELECT DISTINCT c.seq
       FROM content_reactions r
       JOIN contents c ON c.id = r.content_id
       WHERE c.seq > 0
         AND (
           r.actor_id IN (SELECT a.id FROM actors a WHERE a.user_id = ?1)
           OR r.actor_id = ?2
         )`
    )
    .bind(userId, actorId)
    .all<{ seq: number }>();

  return markSeen(
    new Uint8Array(0),
    results.map((row) => row.seq)
  );
}

/**
 * Da xem het kho: bat dau vong moi. Chi giu lai bai da thich hoac da luu
 * de chung khong quay lai feed chinh. Ghi co dieu kien version; neu thiet bi
 * khac vua ghi thi bo qua, lan doc sau se thay ban moi.
 * BLOB rong co the bi gui thanh NULL, nen moi cho ghi seen_bits deu COALESCE.
 */
export async function resetViewerLoop(
  db: D1Database,
  viewer: FeedViewer,
  now: number
): Promise<Uint8Array> {
  const state = viewer.state;

  if (!state) return new Uint8Array(0);

  const kept = await readKeptBits(db, viewer.userId, viewer.actorId);

  await db
    .prepare(
      `UPDATE viewer_feed_state
       SET seen_bits = COALESCE(?1, x''),
           seen_count = ?2,
           positions_json = '{}',
           loop_count = loop_count + 1,
           version = version + 1,
           updated_at = ?3
       WHERE viewer_key = ?4 AND version = ?5`
    )
    .bind(seenBlob(kept.bits), kept.added, now, state.key, state.version)
    .run();

  return kept.bits;
}

/** Hai thiet bi cung ghi: doc lai va tinh lai toi da chung nay lan. */
export const MAX_SEEN_WRITE_ATTEMPTS = 3;

export class ViewerStateBusyError extends Error {
  constructor() {
    super("Viewer feed state is busy");
    this.name = "ViewerStateBusyError";
  }
}

export interface SeenOutcome {
  /** false: khong co gi moi, khong ghi D1. */
  written: boolean;
  added: number;
  seenCount: number;
}

async function readViewerState(
  db: D1Database,
  key: string
): Promise<ViewerState | null> {
  const row = await db
    .prepare(
      `SELECT ${VIEWER_STATE_COLUMNS}
       FROM viewer_feed_state
       WHERE viewer_key = ?1`
    )
    .bind(key)
    .first<ViewerStateRow>();

  return row ? toViewerState(row) : null;
}

async function readSeenTargets(
  db: D1Database,
  ids: readonly string[]
): Promise<SeenTarget[]> {
  const slots = ids.map((_, index) => `?${index + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT seq, published_at
       FROM contents
       WHERE id IN (${slots})
         AND status = 'published'
         AND published_at IS NOT NULL
         AND seq > 0`
    )
    .bind(...ids)
    .all<{ seq: number; published_at: number }>();

  return results.map((row) => ({
    seq: row.seq,
    publishedAt: row.published_at
  }));
}

/**
 * Ghi cac bai vua xem vao bitmap cua nguoi xem, cung vi tri tiep tuc va
 * moc bai moi. Lan dau thi tao dong, kem bai da thich / da luu.
 * Ghi co dieu kien version; bi thiet bi khac chen thi doc lai, tinh lai.
 * state: trang thai da doc cung khoa key (null neu chua co).
 */
export async function recordSeen(
  db: D1Database,
  input: {
    key: string;
    userId: string | null;
    actorId: string | null;
    state: ViewerState | null;
    report: SeenReport;
    now: number;
  }
): Promise<SeenOutcome> {
  const { key, report, now } = input;

  if (input.state && input.state.key !== key) {
    throw new Error("Viewer state key mismatch");
  }

  const targets = await readSeenTargets(db, report.ids);
  let state = input.state;
  let kept: { bits: Uint8Array; added: number } | null = null;

  for (let attempt = 0; attempt < MAX_SEEN_WRITE_ATTEMPTS; attempt++) {
    let base: SeenBase;

    if (state) {
      base = state;
    } else {
      kept ??= await readKeptBits(db, input.userId, input.actorId);
      base = freshBase(kept.bits, kept.added, now);
    }

    const write = applySeenReport(base, targets, report.cursor, now);

    if (!write) {
      return { written: false, added: 0, seenCount: base.seenCount };
    }

    const result = state
      ? await db
          .prepare(
            `UPDATE viewer_feed_state
             SET seen_bits = COALESCE(?1, x''),
                 seen_count = ?2,
                 positions_json = ?3,
                 fresh_at = ?4,
                 version = version + 1,
                 updated_at = ?5
             WHERE viewer_key = ?6 AND version = ?7`
          )
          .bind(
            seenBlob(write.seen),
            write.seenCount,
            write.positionsJson,
            write.freshAt,
            now,
            key,
            state.version
          )
          .run()
      : await db
          .prepare(
            `INSERT INTO viewer_feed_state (
               viewer_key,
               seen_bits,
               seen_count,
               positions_json,
               fresh_at,
               created_at,
               updated_at
             )
             VALUES (?1, COALESCE(?2, x''), ?3, ?4, ?5, ?6, ?6)
             ON CONFLICT(viewer_key) DO NOTHING`
          )
          .bind(
            key,
            seenBlob(write.seen),
            write.seenCount,
            write.positionsJson,
            write.freshAt,
            now
          )
          .run();

    if (result.meta.changes > 0) {
      return { written: true, added: write.added, seenCount: write.seenCount };
    }

    state = await readViewerState(db, key);
  }

  throw new ViewerStateBusyError();
}

async function writeMergedViewerState(
  db: D1Database,
  intoKey: string,
  fromKey: string,
  into: ViewerState | null,
  merged: ReturnType<typeof mergeViewerStates>,
  now: number,
  /** false: khong kiem version (buoc cuoi sau khi thu lai). */
  requireVersion: boolean
): Promise<boolean> {
  if (!into) {
    const renamed = await db
      .prepare(
        `UPDATE viewer_feed_state
         SET viewer_key = ?1, updated_at = ?2
         WHERE viewer_key = ?3
           AND NOT EXISTS (
             SELECT 1 FROM viewer_feed_state WHERE viewer_key = ?1
           )`
      )
      .bind(intoKey, now, fromKey)
      .run();

    return renamed.meta.changes > 0;
  }

  const updated = requireVersion
    ? await db
        .prepare(
          `UPDATE viewer_feed_state
           SET seen_bits = COALESCE(?1, x''),
               seen_count = ?2,
               positions_json = ?3,
               fresh_at = ?4,
               loop_count = ?5,
               version = version + 1,
               updated_at = ?6
           WHERE viewer_key = ?7 AND version = ?8`
        )
        .bind(
          seenBlob(merged.seen),
          merged.seenCount,
          merged.positionsJson,
          merged.freshAt,
          merged.loopCount,
          now,
          intoKey,
          into.version
        )
        .run()
    : await db
        .prepare(
          `UPDATE viewer_feed_state
           SET seen_bits = COALESCE(?1, x''),
               seen_count = ?2,
               positions_json = ?3,
               fresh_at = ?4,
               loop_count = ?5,
               version = version + 1,
               updated_at = ?6
           WHERE viewer_key = ?7`
        )
        .bind(
          seenBlob(merged.seen),
          merged.seenCount,
          merged.positionsJson,
          merged.freshAt,
          merged.loopCount,
          now,
          intoKey
        )
        .run();

  if (updated.meta.changes === 0) return false;

  await db
    .prepare(`DELETE FROM viewer_feed_state WHERE viewer_key = ?1`)
    .bind(fromKey)
    .run();

  return true;
}

/**
 * Sau dang nhap / dang ky: gop bitmap an danh vao tai khoan, xoa dong a:.
 * Chi gop khi ma an danh chua thuoc ai hoac dung la cua tai khoan nay
 * (vua claim khi dang ky). Ma cua nguoi khac thi bo qua.
 */
export async function mergeViewerFeedState(
  db: D1Database,
  input: {
    userId: string;
    actorId: string | null;
    now: number;
  }
): Promise<{ merged: boolean }> {
  const intoKey = userViewerKey(input.userId);
  const fromKey = input.actorId ? actorViewerKey(input.actorId) : null;

  if (!intoKey || !fromKey || !input.actorId) {
    return { merged: false };
  }

  const owner = await db
    .prepare(`SELECT user_id FROM actors WHERE id = ?1`)
    .bind(input.actorId)
    .first<{ user_id: string | null }>();

  // Ma da xoa (mergeActor) hoac chua co hang: van gop dong a: mo coi.
  // Ma dang thuoc tai khoan khac: khong lay lich su cua ho.
  if (owner && owner.user_id !== null && owner.user_id !== input.userId) {
    return { merged: false };
  }

  for (let attempt = 0; attempt < MAX_SEEN_WRITE_ATTEMPTS; attempt++) {
    const into = await readViewerState(db, intoKey);
    const from = await readViewerState(db, fromKey);

    if (!from) return { merged: false };

    const ok = await writeMergedViewerState(
      db,
      intoKey,
      fromKey,
      into,
      mergeViewerStates(into, from),
      input.now,
      true
    );

    if (ok) return { merged: true };
  }

  // Cookie sap tro sang ma chinh: khong de dong a: mo coi.
  const into = await readViewerState(db, intoKey);
  const from = await readViewerState(db, fromKey);

  if (!from) return { merged: false };

  if (into) {
    await writeMergedViewerState(
      db,
      intoKey,
      fromKey,
      into,
      mergeViewerStates(into, from),
      input.now,
      false
    );
    return { merged: true };
  }

  // u: van khong co: INSERT roi xoa a: (tranh UNIQUE khi doi khoa).
  const merged = mergeViewerStates(null, from);

  await db.batch([
    db
      .prepare(
        `INSERT INTO viewer_feed_state (
           viewer_key, seen_bits, seen_count, positions_json,
           fresh_at, loop_count, created_at, updated_at
         )
         VALUES (?1, COALESCE(?2, x''), ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(viewer_key) DO UPDATE SET
           seen_bits = COALESCE(excluded.seen_bits, x''),
           seen_count = excluded.seen_count,
           positions_json = excluded.positions_json,
           fresh_at = excluded.fresh_at,
           loop_count = excluded.loop_count,
           version = viewer_feed_state.version + 1,
           updated_at = excluded.updated_at`
      )
      .bind(
        intoKey,
        seenBlob(merged.seen),
        merged.seenCount,
        merged.positionsJson,
        merged.freshAt,
        merged.loopCount,
        input.now
      ),
    db
      .prepare(`DELETE FROM viewer_feed_state WHERE viewer_key = ?1`)
      .bind(fromKey)
  ]);

  return { merged: true };
}
