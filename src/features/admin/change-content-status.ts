import type { ContentStatus } from "../content/content.types";
import { transitionContent } from "../content/content-lifecycle";

export interface ContentStatusRecord {
  status: ContentStatus;
  publishedAt: number | null;
}

export interface ContentStatusStore {
  find(id: string): Promise<ContentStatusRecord | null>;
  save(
    id: string,
    from: ContentStatus,
    status: ContentStatus,
    publishedAt: number | null,
    now: number,
    note: string | null
  ): Promise<boolean>;
}

export const MAX_STATUS_NOTE = 300;

/** Ly do tuy chon: bo trong la null; qua dai hoac sai kieu thi tu choi. */
export function readStatusNote(
  value: unknown
): { ok: true; note: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, note: null };
  if (typeof value !== "string") return { ok: false };

  const note = value.replace(/\s+/g, " ").trim();
  if (note.length > MAX_STATUS_NOTE) return { ok: false };

  return { ok: true, note: note || null };
}

export type ContentStatusChange =
  | {
      ok: true;
      id: string;
      status: ContentStatus;
      publishedAt: number | null;
    }
  | {
      ok: false;
      reason: "missing" | "rejected";
    };

const statuses: readonly ContentStatus[] = [
  "draft",
  "published",
  "archived"
];

export function isContentStatus(
  value: string
): value is ContentStatus {
  return (statuses as readonly string[]).includes(value);
}

export async function changeContentStatus(
  store: ContentStatusStore,
  id: string,
  to: ContentStatus,
  now: number,
  note: string | null = null
): Promise<ContentStatusChange> {
  const current = await store.find(id);

  if (!current) {
    return { ok: false, reason: "missing" };
  }

  let next;

  try {
    next = transitionContent(
      current.status,
      to,
      current.publishedAt,
      now
    );
  } catch {
    return { ok: false, reason: "rejected" };
  }

  const saved = await store.save(
    id,
    current.status,
    next.status,
    next.publishedAt,
    now,
    // Chi luc tu choi moi can ly do cho nguoi viet.
    next.status === "archived" ? note : null
  );

  if (!saved) {
    return { ok: false, reason: "rejected" };
  }

  return {
    ok: true,
    id,
    status: next.status,
    publishedAt: next.publishedAt
  };
}
