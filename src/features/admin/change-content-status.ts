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
    now: number
  ): Promise<boolean>;
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
  now: number
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
    now
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
