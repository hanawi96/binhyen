/**
 * Con tro feed bo suu tap: sort_order tang dan, sau do content id.
 */
export interface CollectionCursor {
  sortOrder: number;
  id: string;
}

const MAX_ID_LENGTH = 128;
const PATTERN = /^c1:(-?\d{1,12}):([^:]+)$/;

export function encodeCollectionCursor(cursor: CollectionCursor): string {
  return `c1:${cursor.sortOrder}:${encodeURIComponent(cursor.id)}`;
}

export function decodeCollectionCursor(value: string): CollectionCursor | null {
  const match = PATTERN.exec(value);
  if (!match) return null;

  const sortOrder = Number(match[1]);
  if (!Number.isSafeInteger(sortOrder)) return null;

  try {
    const id = decodeURIComponent(match[2] ?? "");
    if (id.length === 0 || id.length > MAX_ID_LENGTH) return null;
    return { sortOrder, id };
  } catch {
    return null;
  }
}
