import { CONTENT_ID_PATTERN } from "../admin/admin-http";
import { browserStorage } from "./recent-seen";
import { MAX_SEEN_IDS, SEEN_BODY_LIMIT } from "./seen-report";

/** Gui khi du so the nay; roi trang thi gui het phan con lai. */
export const SEEN_BATCH_SIZE = 5;
export const SEEN_PENDING_KEY = "binhyen-seen-pending";

export interface SeenPendingItem {
  id: string;
  /** pageCursor cua trang chua the; null khi khong co (muc Yeu thich). */
  cursor: string | null;
}

export interface SeenReportBody {
  ids: string[];
  cursor: string | null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isPendingItem(value: unknown): value is SeenPendingItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as { id?: unknown; cursor?: unknown };

  return (
    typeof item.id === "string" &&
    CONTENT_ID_PATTERN.test(item.id) &&
    (item.cursor === null || typeof item.cursor === "string")
  );
}

/** Hang doi hong thi bo; id trung thi giu ban dau tien. */
export function parseSeenPending(raw: string | null): SeenPendingItem[] {
  if (raw === null) return [];

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const items: SeenPendingItem[] = [];

  for (const entry of value) {
    if (!isPendingItem(entry) || seen.has(entry.id)) continue;
    if (entry.cursor !== null && entry.cursor.length > 1024) continue;

    seen.add(entry.id);
    items.push({ id: entry.id, cursor: entry.cursor });
  }

  return items.slice(0, MAX_SEEN_IDS * 4);
}

export function readSeenPending(storage: StorageLike | null): SeenPendingItem[] {
  if (!storage) return [];

  try {
    return parseSeenPending(storage.getItem(SEEN_PENDING_KEY));
  } catch {
    return [];
  }
}

export function writeSeenPending(
  storage: StorageLike | null,
  items: readonly SeenPendingItem[]
): void {
  if (!storage) return;

  try {
    if (items.length === 0) storage.removeItem(SEEN_PENDING_KEY);
    else storage.setItem(SEEN_PENDING_KEY, JSON.stringify(items));
  } catch {
    // Bi chan luu thi chi mat hang doi.
  }
}

/**
 * Cat mot lo gui di tu dau hang doi. Cursor lay theo the cuoi lo
 * (trang dang xem gan nhat).
 */
export function takeSeenBatch(
  pending: readonly SeenPendingItem[],
  limit: number
): { body: SeenReportBody | null; rest: SeenPendingItem[] } {
  const size = Math.min(
    Math.max(0, Math.floor(limit)),
    MAX_SEEN_IDS,
    pending.length
  );

  if (size === 0) return { body: null, rest: [...pending] };

  const batch = pending.slice(0, size);
  const last = batch[batch.length - 1];

  return {
    body: {
      ids: batch.map((item) => item.id),
      cursor: last?.cursor ?? null
    },
    rest: pending.slice(size)
  };
}

export function seenReportJson(body: SeenReportBody): string {
  return JSON.stringify(body);
}

export function fitsSeenBody(body: SeenReportBody): boolean {
  return seenReportJson(body).length <= SEEN_BODY_LIMIT;
}

export interface SeenReporter {
  /** Danh dau the da xem on dinh; tu gui khi du lo. */
  mark(id: string, cursor: string | null): void;
  /** Gui het hang doi bang fetch. true = hang doi trong. */
  flush(): Promise<boolean>;
  /** Gui bang sendBeacon khi roi trang; phan con lai giu trong localStorage. */
  flushOnLeave(): void;
  pendingCount(): number;
}

export interface SeenReporterOptions {
  origin?: string;
  batchSize?: number;
  storage?: StorageLike | null;
  fetch?: typeof fetch;
  sendBeacon?: (url: string, data: BodyInit) => boolean;
}

function pageOrigin(origin: string | undefined): string {
  if (origin) return origin;
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/**
 * Bao da xem len server theo lo, kem hang doi localStorage de thu lai
 * sau khi tat tab dot ngot.
 */
export function createSeenReporter(
  options: SeenReporterOptions = {}
): SeenReporter {
  const storage =
    options.storage === undefined ? browserStorage() : options.storage;
  const batchSize = options.batchSize ?? SEEN_BATCH_SIZE;
  const fetchPage = options.fetch ?? fetch;
  const pending = readSeenPending(storage);
  const queued = new Set(pending.map((item) => item.id));
  let chain: Promise<void> = Promise.resolve();

  function persist() {
    writeSeenPending(storage, pending);
  }

  function endpoint(): string {
    const origin = pageOrigin(options.origin);
    return origin ? `${origin}/api/feed/seen` : "/api/feed/seen";
  }

  async function sendFetch(body: SeenReportBody): Promise<boolean> {
    try {
      const response = await fetchPage(endpoint(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: seenReportJson(body),
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  function tryBeacon(body: SeenReportBody): boolean {
    const beacon =
      options.sendBeacon ??
      (typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
        ? (url: string, data: BodyInit) => navigator.sendBeacon(url, data)
        : null);

    if (!beacon) return false;

    try {
      return beacon(
        endpoint(),
        new Blob([seenReportJson(body)], { type: "application/json" })
      );
    } catch {
      return false;
    }
  }

  function commitBatch(body: SeenReportBody, rest: SeenPendingItem[]) {
    pending.length = 0;
    pending.push(...rest);

    for (const id of body.ids) queued.delete(id);

    persist();
  }

  async function flushOnce(limit: number): Promise<"empty" | "sent" | "stuck"> {
    const { body, rest } = takeSeenBatch(pending, limit);

    if (!body) return "empty";

    if (!fitsSeenBody(body)) {
      if (limit <= 1) return "stuck";
      return flushOnce(Math.max(1, Math.floor(limit / 2)));
    }

    if (!(await sendFetch(body))) return "stuck";

    commitBatch(body, rest);
    return rest.length === 0 ? "empty" : "sent";
  }

  async function flushAll(): Promise<boolean> {
    for (;;) {
      const outcome = await flushOnce(MAX_SEEN_IDS);

      if (outcome === "empty") return true;
      if (outcome === "stuck") return false;
    }
  }

  return {
    mark(id, cursor) {
      if (!CONTENT_ID_PATTERN.test(id) || queued.has(id)) return;

      pending.push({ id, cursor });
      queued.add(id);
      persist();

      if (pending.length >= batchSize) {
        chain = chain.then(() => flushAll()).then(() => undefined, () => undefined);
      }
    },

    async flush() {
      const result = chain.then(() => flushAll());
      chain = result.then(
        () => undefined,
        () => undefined
      );

      try {
        return await result;
      } catch {
        return false;
      }
    },

    flushOnLeave() {
      while (pending.length > 0) {
        const { body, rest } = takeSeenBatch(pending, MAX_SEEN_IDS);

        if (!body || !fitsSeenBody(body) || !tryBeacon(body)) break;

        commitBatch(body, rest);
      }

      persist();
    },

    pendingCount() {
      return pending.length;
    }
  };
}
