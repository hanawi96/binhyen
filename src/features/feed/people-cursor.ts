/**
 * Con tro muc "Nguoi khac".
 * Thu tu: published_at giam dan, sau do id giam dan.
 */
export interface PeopleCursor {
  publishedAt: number;
  id: string;
}

const MAX_ID_LENGTH = 128;
const PEOPLE_PATTERN = /^p1:(\d{1,12}):([^:]+)$/;

export function encodePeopleCursor(cursor: PeopleCursor): string {
  return `p1:${cursor.publishedAt}:${encodeURIComponent(cursor.id)}`;
}

export function decodePeopleCursor(value: string): PeopleCursor | null {
  const match = PEOPLE_PATTERN.exec(value);
  if (!match) return null;

  const publishedAt = Number(match[1]);
  if (!Number.isSafeInteger(publishedAt) || publishedAt < 1) return null;

  try {
    const id = decodeURIComponent(match[2] ?? "");
    if (id.length === 0 || id.length > MAX_ID_LENGTH) return null;

    return { publishedAt, id };
  } catch {
    return null;
  }
}
