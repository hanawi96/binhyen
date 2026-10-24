import {
  parseHttpsMediaUrl,
  parseImageAlt,
  parseImageSize
} from "../content/content-media";
import {
  contentKinds,
  contentMoods,
  contentTopics,
  type ContentFormat,
  type ContentKind,
  type ContentMood,
  type ContentStatus,
  type ContentTheme,
  type ContentTopic
} from "../content/content.types";
import { lookFromTopic } from "../content/topic-look";
import { parseCollectionIdList } from "../collections/d1-collections";
import { parsePollOptions } from "../interactions/content-polls";

export interface ContentDraftInput {
  title: string;
  description: string;
  category: string;
  tag: string;
  format: ContentFormat;
  kind: ContentKind;
  theme: ContentTheme;
  topics: ContentTopic[];
  moods: ContentMood[];
  sourceLabel: string;
  sourceUrl: string;
  body: string;
  /** URL HTTPS khi format = image | video. */
  imageUrl: string;
  imageAlt: string;
  imageWidth: number | null;
  imageHeight: number | null;
  /** Poster HTTPS tuy chon khi format = video. */
  posterUrl: string;
  /** Nhan dap an khi format = poll (2–4). */
  pollOptions: string[];
  /** Ids bo suu tap (co the rong). */
  collectionIds: string[];
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
  sourceLabel: 80,
  sourceUrl: 300,
  body: 8000,
  query: 80
} as const;

function text(
  value: unknown,
  limit: number
): string | null {
  if (value === undefined) return "";
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

/**
 * Form bien tap gui title / topics / moods / body|image|poll / nguon / format.
 * description, kind, theme, category, tag do server gan theo chu de dau.
 */
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
  const sourceLabel = text(source.sourceLabel, LIMITS.sourceLabel);
  const sourceUrl = text(source.sourceUrl, LIMITS.sourceUrl);
  const body = text(source.body, LIMITS.body);
  const topics = manyOf(source.topics, contentTopics);
  const moods = manyOf(source.moods, contentMoods);
  let format: ContentFormat = "text";

  if (source.format === "poll") format = "poll";
  else if (source.format === "image") format = "image";
  else if (source.format === "video") format = "video";
  else if (source.format !== undefined && source.format !== "text") {
    return { ok: false, error: "Định dạng không hợp lệ." };
  }

  if (!title) {
    return {
      ok: false,
      error:
        format === "poll"
          ? "Hãy nhập câu hỏi."
          : format === "image"
            ? "Hãy nhập chú thích ảnh."
            : format === "video"
              ? "Hãy nhập chú thích video."
              : "Hãy nhập câu chữ chính."
    };
  }

  if (!topics || topics.length === 0 || !topics[0]) {
    return { ok: false, error: "Hãy chọn ít nhất một chủ đề." };
  }

  if (sourceLabel === null || body === null || !moods) {
    return { ok: false, error: "Một vài mục chưa hợp lệ." };
  }

  if (sourceUrl === null || !httpUrl(sourceUrl)) {
    return { ok: false, error: "Liên kết nguồn không hợp lệ." };
  }

  let imageUrl = "";
  let imageAlt = "";
  let imageWidth: number | null = null;
  let imageHeight: number | null = null;
  let posterUrl = "";
  let pollOptions: string[] = [];
  const collectionIds = parseCollectionIdList(source.collectionIds);
  if (collectionIds === null) {
    return { ok: false, error: "Danh sách bộ sưu tập không hợp lệ." };
  }

  if (format === "image" || format === "video") {
    const url = parseHttpsMediaUrl(source.imageUrl);
    if (!url) {
      return {
        ok: false,
        error:
          format === "video"
            ? "Cần URL video HTTPS hoặc đường dẫn /api/media/… hợp lệ."
            : "Cần URL ảnh HTTPS hoặc đường dẫn /api/media/… hợp lệ."
      };
    }

    const alt = parseImageAlt(source.imageAlt);
    if (alt === null) {
      return {
        ok: false,
        error:
          format === "video" ? "Mô tả video quá dài." : "Mô tả ảnh quá dài."
      };
    }

    const width = parseImageSize(source.imageWidth);
    if (
      source.imageWidth !== undefined &&
      source.imageWidth !== null &&
      source.imageWidth !== "" &&
      width === null
    ) {
      return { ok: false, error: "Chiều rộng media không hợp lệ." };
    }

    const height = parseImageSize(source.imageHeight);
    if (
      source.imageHeight !== undefined &&
      source.imageHeight !== null &&
      source.imageHeight !== "" &&
      height === null
    ) {
      return { ok: false, error: "Chiều cao media không hợp lệ." };
    }

    imageUrl = url;
    imageAlt = alt;
    imageWidth = width;
    imageHeight = height;

    if (format === "video") {
      const posterRaw = source.posterUrl;
      if (
        posterRaw !== undefined &&
        posterRaw !== null &&
        posterRaw !== ""
      ) {
        const poster = parseHttpsMediaUrl(posterRaw);
        if (!poster) {
          return {
            ok: false,
            error: "Ảnh xem trước phải là HTTPS hoặc /api/media/… hợp lệ."
          };
        }
        posterUrl = poster;
      }
    }
  }

  if (format === "poll") {
    const options = parsePollOptions(source.pollOptions);
    if (!options) {
      return {
        ok: false,
        error: "Khảo sát cần 2 đến 4 đáp án khác nhau."
      };
    }
    pollOptions = options;
  }

  return {
    ok: true,
    value: {
      title,
      description: "",
      tag: "",
      format,
      kind: "story",
      topics,
      moods,
      sourceLabel,
      sourceUrl,
      body: format === "text" ? body : "",
      imageUrl,
      imageAlt,
      imageWidth,
      imageHeight,
      posterUrl,
      pollOptions,
      collectionIds,
      ...lookFromTopic(topics[0])
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
