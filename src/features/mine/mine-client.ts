import type { ContentStatus, ContentTheme } from "../content/content.types";
import { isContentTheme } from "../content/content.types";

export type MineKind = "like" | "save";

/** Du de mo ngan doc bai. */
export interface MineOpenable {
  id: string;
  title: string;
  category: string;
  description: string;
  theme: ContentTheme;
}

export interface MinePost extends MineOpenable {
  status: ContentStatus;
  createdAt: number;
  fresh: boolean;
  note: string | null;
}

export interface MinePostPage {
  items: MinePost[];
  nextCursor: string | null;
  total: number | null;
}

export interface MineItem {
  id: string;
  title: string;
  category: string;
  description: string;
  theme: ContentTheme;
  reactedAt: number;
}

export interface MineCounts {
  liked: number;
  saved: number;
}

export interface MinePage {
  items: MineItem[];
  nextCursor: string | null;
  counts: MineCounts | null;
}

const firstPages = new Map<MineKind, Promise<MinePage | null>>();
let generation = 0;

function readItem(value: unknown): MineItem | null {
  if (!value || typeof value !== "object") return null;

  const { id, title, category, description, theme, reactedAt } =
    value as Record<string, unknown>;

  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof category !== "string" ||
    typeof description !== "string" ||
    typeof reactedAt !== "number"
  ) {
    return null;
  }

  return {
    id,
    title,
    category,
    description,
    theme: typeof theme === "string" && isContentTheme(theme) ? theme : "peace",
    reactedAt
  };
}

function readCounts(value: unknown): MineCounts | null {
  if (!value || typeof value !== "object") return null;

  const { liked, saved } = value as Record<string, unknown>;

  return typeof liked === "number" && typeof saved === "number"
    ? { liked, saved }
    : null;
}

export function readMinePage(value: unknown): MinePage | null {
  if (!value || typeof value !== "object") return null;

  const { success, items, nextCursor, counts } =
    value as Record<string, unknown>;

  if (success !== true || !Array.isArray(items)) return null;

  return {
    items: items
      .map(readItem)
      .filter((item): item is MineItem => item !== null),
    nextCursor: typeof nextCursor === "string" ? nextCursor : null,
    counts: readCounts(counts)
  };
}

export async function loadMinePage(
  kind: MineKind,
  cursor: string | null
): Promise<MinePage | null> {
  const params = new URLSearchParams({ kind });
  if (cursor) params.set("cursor", cursor);

  try {
    const response = await fetch(`/api/me/reactions?${params}`);
    if (!response.ok) return null;
    return readMinePage(await response.json());
  } catch {
    return null;
  }
}

function readPost(value: unknown): MinePost | null {
  if (!value || typeof value !== "object") return null;

  const {
    id,
    title,
    category,
    description,
    theme,
    status,
    createdAt,
    fresh,
    note
  } = value as Record<string, unknown>;

  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof category !== "string" ||
    typeof description !== "string" ||
    typeof createdAt !== "number" ||
    (status !== "draft" && status !== "published" && status !== "archived")
  ) {
    return null;
  }

  return {
    id,
    title,
    category,
    description,
    theme: typeof theme === "string" && isContentTheme(theme) ? theme : "peace",
    status,
    createdAt,
    fresh: fresh === true,
    note: typeof note === "string" && note ? note : null
  };
}

export function readMinePostPage(value: unknown): MinePostPage | null {
  if (!value || typeof value !== "object") return null;

  const { success, items, nextCursor, total } =
    value as Record<string, unknown>;

  if (success !== true || !Array.isArray(items)) return null;

  return {
    items: items
      .map(readPost)
      .filter((item): item is MinePost => item !== null),
    nextCursor: typeof nextCursor === "string" ? nextCursor : null,
    total: typeof total === "number" ? total : null
  };
}

export async function loadMinePosts(
  cursor: string | null
): Promise<MinePostPage | null> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);

  try {
    const response = await fetch(`/api/me/posts?${params}`);
    if (!response.ok) return null;
    return readMinePostPage(await response.json());
  } catch {
    return null;
  }
}

export interface PostFields {
  title: string;
  description: string;
  body: string;
  topics: string[];
}

export type PostOutcome =
  | { ok: true; post: MinePost }
  | { ok: false; message: string };

const POST_FALLBACK = "Chưa gửi được bài. Hãy thử lại.";

function fieldsOf(body: unknown): Record<string, unknown> {
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

/** Cau bao loi cho nguoi viet tu ma loi va than tra ve. */
export function readPostError(
  status: number,
  body: unknown,
  fallback = POST_FALLBACK
): string {
  if (status === 401) return "Phiên đăng nhập đã hết. Hãy đăng nhập lại.";

  const error = fieldsOf(body).error;
  const text = typeof error === "string" ? error : "";

  if (status === 429 && (!text || text === "Too many requests")) {
    return "Bạn gửi hơi nhanh. Đợi vài giây rồi thử lại nhé.";
  }

  // May chu tra loi tieng Viet cho cac loi nguoi viet sua duoc.
  if ([400, 404, 409, 429].includes(status) && text) return text;

  return fallback;
}

export function readPostOutcome(status: number, body: unknown): PostOutcome {
  if (status === 201) {
    const post = readPost(fieldsOf(body).post);
    return post ? { ok: true, post } : { ok: false, message: POST_FALLBACK };
  }

  return { ok: false, message: readPostError(status, body) };
}

export type DraftOutcome =
  | { ok: true; draft: PostFields }
  | { ok: false; message: string };

export function readDraft(body: unknown): PostFields | null {
  const post = fieldsOf(fieldsOf(body).post);
  const { title, description, body: text, topics } = post;

  if (
    typeof title !== "string" ||
    typeof description !== "string" ||
    typeof text !== "string" ||
    !Array.isArray(topics)
  ) {
    return null;
  }

  return {
    title,
    description,
    body: text,
    topics: topics.filter((topic): topic is string => typeof topic === "string")
  };
}

/** Ban nhap cua chinh minh de sua; da duyet thi may chu tra 409. */
export async function loadDraft(id: string): Promise<DraftOutcome> {
  const fallback = "Chưa mở được bài. Hãy thử lại.";

  try {
    const response = await fetch(`/api/me/posts/${encodeURIComponent(id)}`, {
      cache: "no-store"
    });
    const body: unknown = await response.json().catch(() => null);
    const draft = response.ok ? readDraft(body) : null;

    return draft
      ? { ok: true, draft }
      : { ok: false, message: readPostError(response.status, body, fallback) };
  } catch {
    return { ok: false, message: fallback };
  }
}

export type SimpleOutcome = { ok: true } | { ok: false; message: string };

export async function updatePost(
  id: string,
  fields: PostFields
): Promise<SimpleOutcome> {
  const fallback = "Chưa lưu được. Hãy thử lại.";

  try {
    const response = await fetch(`/api/me/posts/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields)
    });
    if (response.ok) return { ok: true };

    const body: unknown = await response.json().catch(() => null);
    return { ok: false, message: readPostError(response.status, body, fallback) };
  } catch {
    return { ok: false, message: fallback };
  }
}

export async function withdrawPost(id: string): Promise<SimpleOutcome> {
  const fallback = "Chưa rút được bài. Hãy thử lại.";

  try {
    const response = await fetch(`/api/me/posts/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    if (response.ok) return { ok: true };

    const body: unknown = await response.json().catch(() => null);
    return { ok: false, message: readPostError(response.status, body, fallback) };
  } catch {
    return { ok: false, message: fallback };
  }
}

export async function submitPost(fields: PostFields): Promise<PostOutcome> {
  try {
    const response = await fetch("/api/me/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields)
    });
    const body: unknown = await response.json().catch(() => null);
    return readPostOutcome(response.status, body);
  } catch {
    return { ok: false, message: POST_FALLBACK };
  }
}

/** Goi khi cham nut "Cua toi" de du lieu ve truoc khi ngan mo xong. */
export function prefetchMine(kind: MineKind): Promise<MinePage | null> {
  let page = firstPages.get(kind);

  if (!page) {
    page = loadMinePage(kind, null).then((result) => {
      if (!result) firstPages.delete(kind);
      return result;
    });
    firstPages.set(kind, page);
  }

  return page;
}

/** Sau moi lan thich / luu, lan mo ngan ke tiep se tai lai. */
export function invalidateMine() {
  firstPages.clear();
  generation += 1;
}

export function mineGeneration(): number {
  return generation;
}
