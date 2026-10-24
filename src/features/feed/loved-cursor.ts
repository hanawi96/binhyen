/**
 * Con tro cua muc "Yeu thich nhat".
 * Thu tu: like_count giam dan, sau do id giam dan.
 */
export interface LovedCursor {
  likeCount: number;
  id: string;
}

const MAX_ID_LENGTH = 128;
const LOVED_PATTERN = /^l1:(\d{1,12}):([^:]+)$/;

export function encodeLovedCursor(cursor: LovedCursor): string {
  return `l1:${cursor.likeCount}:${encodeURIComponent(cursor.id)}`;
}

export function decodeLovedCursor(value: string): LovedCursor | null {
  const match = LOVED_PATTERN.exec(value);
  if (!match) return null;

  const likeCount = Number(match[1]);
  if (!Number.isSafeInteger(likeCount) || likeCount < 1) return null;

  try {
    const id = decodeURIComponent(match[2] ?? "");
    if (id.length === 0 || id.length > MAX_ID_LENGTH) return null;

    return { likeCount, id };
  } catch {
    return null;
  }
}
