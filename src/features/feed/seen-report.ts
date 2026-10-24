import { CONTENT_ID_PATTERN } from "../admin/admin-http";
import type { ViewerState } from "./d1-viewer-state";
import {
  decodeRingCursor,
  encodeRingCursor,
  type RingCursor
} from "./ring-feed";
import { markSeen } from "./seen-bits";
import { serializePositions, writePosition } from "./viewer-positions";

/** Client gui moi ~5 the; chua cho du phong khi gui don luc thoat trang. */
export const MAX_SEEN_IDS = 30;
/** 30 id x 80 ky tu + cursor 1024 ky tu, con du cho JSON. */
export const SEEN_BODY_LIMIT = 4096;

export interface SeenReport {
  ids: string[];
  /** Cursor dau trang chua the cuoi cung da xem; lan sau mo lai di tiep tu day. */
  cursor: RingCursor | null;
}

/** Bai da bao, doc tu D1. */
export interface SeenTarget {
  seq: number;
  publishedAt: number;
}

/** Phan cua ViewerState ma mot lan bao da xem co the doi. */
export type SeenBase = Pick<
  ViewerState,
  "seen" | "seenCount" | "positions" | "freshAt"
>;

export interface SeenWrite {
  seen: Uint8Array;
  seenCount: number;
  positionsJson: string;
  freshAt: number;
  added: number;
}

/** { ids: string[], cursor?: string | null }. Sai bat ky phan nao thi null. */
export function parseSeenReport(body: unknown): SeenReport | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const { ids, cursor } = body as { ids?: unknown; cursor?: unknown };

  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_SEEN_IDS ||
    !ids.every(
      (id): id is string => typeof id === "string" && CONTENT_ID_PATTERN.test(id)
    )
  ) {
    return null;
  }

  let ringCursor: RingCursor | null = null;

  if (cursor !== undefined && cursor !== null) {
    if (typeof cursor !== "string") return null;

    ringCursor = decodeRingCursor(cursor);
    if (!ringCursor) return null;
  }

  return { ids: [...new Set(ids)], cursor: ringCursor };
}

/** Trang thai cua nguoi lan dau bao da xem: bai da thich / da luu tinh la da xem. */
export function freshBase(kept: Uint8Array, keptCount: number, now: number): SeenBase {
  return {
    seen: kept,
    seenCount: keptCount,
    positions: new Map(),
    freshAt: now
  };
}

/**
 * Trang thai moi sau mot lan bao. null: khong co gi doi, khoi ghi D1.
 * Moc bai moi tien toi bai moi nhat vua xem (khong qua hien tai): bai moi
 * di lan rieng theo thu tu dang cu truoc, nen bai dang truoc no da duoc dua ra.
 */
export function applySeenReport(
  base: SeenBase,
  targets: readonly SeenTarget[],
  cursor: RingCursor | null,
  now: number
): SeenWrite | null {
  const marked = markSeen(
    base.seen,
    targets.map((target) => target.seq)
  );

  let freshAt = base.freshAt;

  for (const target of targets) {
    if (target.publishedAt > freshAt) freshAt = Math.min(target.publishedAt, now);
  }

  const before = serializePositions(base.positions);
  const positionsJson = cursor
    ? serializePositions(
        writePosition(
          base.positions,
          cursor.topic,
          cursor.mood,
          encodeRingCursor(cursor)
        )
      )
    : before;

  if (marked.added === 0 && freshAt === base.freshAt && positionsJson === before) {
    return null;
  }

  return {
    seen: marked.bits,
    seenCount: base.seenCount + marked.added,
    positionsJson,
    freshAt,
    added: marked.added
  };
}
