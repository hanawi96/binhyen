/**
 * Luoi an toan o client: nho cac the vua xem tren thiet bi nay
 * de bo qua neu chung quay lai (doi bo loc, qua diem quay vong).
 */
export const RECENT_SEEN_KEY = "binhyen-recent";
export const RECENT_SEEN_MAX = 200;

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

/** Du lieu hong thi coi nhu chua xem gi; giu thu tu cu toi moi. */
export function parseRecentSeen(raw: string | null): string[] {
  if (raw === null) return [];

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(value)) return [];

  let list: string[] = [];

  for (const id of value) {
    if (isId(id)) list = pushRecentSeen(list, id);
  }

  return list;
}

/** Dua id len cuoi (moi nhat), bo ban cu, cat bot phan cu nhat. */
export function pushRecentSeen(
  list: readonly string[],
  id: string,
  max = RECENT_SEEN_MAX
): string[] {
  const next = list.filter((item) => item !== id);

  next.push(id);

  return next.length > max ? next.slice(next.length - max) : next;
}

/** Chi doc window.localStorage cung co the nem loi khi trinh duyet chan. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecentSeen(storage: Pick<Storage, "getItem">): string[] {
  try {
    return parseRecentSeen(storage.getItem(RECENT_SEEN_KEY));
  } catch {
    return [];
  }
}

export function writeRecentSeen(
  storage: Pick<Storage, "setItem">,
  list: readonly string[]
): void {
  try {
    storage.setItem(RECENT_SEEN_KEY, JSON.stringify(list));
  } catch {
    // Trinh duyet chan luu thi chi mat luoi an toan, feed van chay.
  }
}
