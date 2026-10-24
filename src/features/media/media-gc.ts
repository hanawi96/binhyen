import {
  isSafeMediaKey,
  mediaKeyFromPath
} from "./media-ref";

/** Doc url + poster dang gan vao bai (co the la HTTPS ngoai). */
export async function listContentMediaRefs(
  db: D1Database,
  contentId: string
): Promise<string[]> {
  const row = await db
    .prepare(
      `SELECT url, poster_url
       FROM content_media
       WHERE content_id = ?1
       LIMIT 1`
    )
    .bind(contentId)
    .first<{ url: string; poster_url: string | null }>();

  if (!row) return [];

  const refs: string[] = [];
  if (row.url) refs.push(row.url);
  if (row.poster_url) refs.push(row.poster_url);
  return refs;
}

/** Key R2 local co trong before nhung khong con trong after. */
export function orphanLocalMediaKeys(
  before: readonly string[],
  after: readonly string[]
): string[] {
  const keep = new Set<string>();

  for (const ref of after) {
    const key = mediaKeyFromPath(ref);
    if (key && isSafeMediaKey(key)) keep.add(key);
  }

  const drop: string[] = [];
  const seen = new Set<string>();

  for (const ref of before) {
    const key = mediaKeyFromPath(ref);
    if (!key || !isSafeMediaKey(key) || keep.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    drop.push(key);
  }

  return drop;
}

/** Xoa object R2; loi tung key khong chan luong chinh. */
export async function deleteLocalMediaKeys(
  bucket: R2Bucket | null | undefined,
  keys: readonly string[]
): Promise<string[]> {
  if (!bucket || keys.length === 0) return [];

  const removed: string[] = [];

  for (const key of keys) {
    if (!isSafeMediaKey(key)) continue;

    try {
      await bucket.delete(key);
      removed.push(key);
    } catch (error) {
      console.error("R2 media GC error:", key, error);
    }
  }

  return removed;
}

/**
 * Sau khi DB doi media: xoa R2 khong con duoc tham chieu.
 * Goi sau khi ghi DB thanh cong.
 */
export async function gcContentMediaChange(
  bucket: R2Bucket | null | undefined,
  before: readonly string[],
  after: readonly string[]
): Promise<string[]> {
  return deleteLocalMediaKeys(bucket, orphanLocalMediaKeys(before, after));
}
