import {
  contentKinds,
  contentMoods,
  contentThemes,
  contentTopics,
  type ContentKind,
  type ContentMood,
  type ContentStatus,
  type ContentTheme,
  type ContentTopic
} from "../content/content.types";

export interface ContentDraftInput {
  title: string;
  description: string;
  category: string;
  tag: string;
  kind: ContentKind;
  theme: ContentTheme;
  topics: ContentTopic[];
  moods: ContentMood[];
  sourceLabel: string;
  sourceUrl: string;
  body: string;
}

export type AdminSort = "updated" | "created";

export interface AdminListQuery {
  status: "all" | ContentStatus;
  q: string;
  kind: ContentKind | "";
  topic: ContentTopic | "";
  sort: AdminSort;
  review: boolean;
  cursor: { sort: AdminSort; at: number; id: string } | null;
  limit: number;
}

const LIMITS = {
  title: 280,
  description: 400,
  category: 80,
  tag: 48,
  sourceLabel: 80,
  sourceUrl: 300,
  body: 8000,
  query: 80
} as const;

function text(
  value: unknown,
  limit: number
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > limit) return null;
  return trimmed;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  if (typeof value !== "string") return null;
  return allowed.includes(value as T) ? (value as T) : null;
}

function manyOf<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T[] | null {
  if (!Array.isArray(value) || value.length > allowed.length) {
    return null;
  }

  const chosen: T[] = [];

  for (const item of value) {
    const match = oneOf(item, allowed);
    if (!match || chosen.includes(match)) return null;
    chosen.push(match);
  }

  return chosen;
}

function httpUrl(value: string): boolean {
  if (!value) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseContentDraft(
  input: unknown
):
  | { ok: true; value: ContentDraftInput }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Yêu cầu không đọc được." };
  }

  const source = input as Record<string, unknown>;
  const title = text(source.title, LIMITS.title);
  const description = text(source.description, LIMITS.description);
  const category = text(source.category, LIMITS.category);
  const tag = text(source.tag, LIMITS.tag);
  const sourceLabel = text(source.sourceLabel, LIMITS.sourceLabel);
  const sourceUrl = text(source.sourceUrl, LIMITS.sourceUrl);
  const body = text(source.body, LIMITS.body);
  const kind = oneOf(source.kind, contentKinds);
  const theme = oneOf(source.theme, contentThemes);
  const topics = manyOf(source.topics, contentTopics);
  const moods = manyOf(source.moods, contentMoods);

  if (!title) {
    return { ok: false, error: "Hãy nhập câu chữ chính." };
  }

  if (!category) {
    return { ok: false, error: "Hãy chọn nhóm hiển thị." };
  }

  if (
    description === null ||
    tag === null ||
    sourceLabel === null ||
    body === null ||
    !kind ||
    !theme ||
    !topics ||
    !moods
  ) {
    return { ok: false, error: "Một vài mục chưa hợp lệ." };
  }

  if (sourceUrl === null || !httpUrl(sourceUrl)) {
    return { ok: false, error: "Liên kết nguồn không hợp lệ." };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      category,
      tag,
      kind,
      theme,
      topics,
      moods,
      sourceLabel,
      sourceUrl,
      body
    }
  };
}

export function encodeAdminCursor(
  sort: AdminSort,
  at: number,
  id: string
): string {
  const mark = sort === "created" ? "c" : "u";
  return `${mark}.${at}.${id}`;
}

export function decodeAdminCursor(
  value: string | null
): { sort: AdminSort; at: number; id: string } | null {
  if (!value) return null;

  const current = /^(u|c)\.(\d{1,12})\.([A-Za-z0-9_-]{1,80})$/.exec(
    value
  );

  if (current) {
    return {
      sort: current[1] === "c" ? "created" : "updated",
      at: Number(current[2]),
      id: current[3] ?? ""
    };
  }

  const older = /^(\d{1,12})\.([A-Za-z0-9_-]{1,80})$/.exec(value);
  if (!older) return null;

  return {
    sort: "updated",
    at: Number(older[1]),
    id: older[2] ?? ""
  };
}

export function parseAdminListQuery(params: {
  status: string | null;
  q: string | null;
  kind: string | null;
  topic: string | null;
  sort: string | null;
  review: string | null;
  cursor: string | null;
  limit: string | null;
}):
  | { ok: true; value: AdminListQuery }
  | { ok: false; error: string } {
  const status = params.status ?? "all";

  if (
    status !== "all" &&
    status !== "draft" &&
    status !== "published" &&
    status !== "archived"
  ) {
    return { ok: false, error: "Bộ lọc trạng thái không hợp lệ." };
  }

  const q = (params.q ?? "").trim();

  if (q.length > LIMITS.query) {
    return { ok: false, error: "Từ tìm kiếm quá dài." };
  }

  const kindValue = params.kind ?? "";
  const kind = kindValue
    ? oneOf(kindValue, contentKinds)
    : "";

  if (kind === null) {
    return { ok: false, error: "Loại nội dung không hợp lệ." };
  }

  const topicValue = params.topic ?? "";
  const topic = topicValue
    ? oneOf(topicValue, contentTopics)
    : "";

  if (topic === null) {
    return { ok: false, error: "Chủ đề không hợp lệ." };
  }

  const sort = params.sort ?? "updated";

  if (sort !== "updated" && sort !== "created") {
    return { ok: false, error: "Cách sắp xếp không hợp lệ." };
  }

  const cursor = decodeAdminCursor(params.cursor);

  if (params.cursor && !cursor) {
    return { ok: false, error: "Trang tiếp theo không hợp lệ." };
  }

  if (cursor && cursor.sort !== sort) {
    return { ok: false, error: "Trang tiếp theo không hợp lệ." };
  }

  let limit = 12;

  if (params.limit) {
    if (!/^\d{1,2}$/.test(params.limit)) {
      return { ok: false, error: "Số bài mỗi trang không hợp lệ." };
    }

    limit = Number(params.limit);

    if (limit < 1 || limit > 20) {
      return { ok: false, error: "Số bài mỗi trang không hợp lệ." };
    }
  }

  return {
    ok: true,
    value: {
      status,
      q,
      kind,
      topic,
      sort,
      review: params.review === "1",
      cursor,
      limit
    }
  };
}

export function likeContains(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.min(60, Math.ceil(words / 180)));
}
