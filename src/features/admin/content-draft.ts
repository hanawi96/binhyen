import {
  parseHttpsMediaUrl,
  parseImageAlt,
  parseImageSize
} from "../content/content-media";
import {
  contentKinds,
  type ContentFormat,
  type ContentKind,
  type ContentStatus,
  type ContentTheme
} from "../content/content.types";
import {
  categoryForTopicSlug,
  DEFAULT_CONTENT_THEME
} from "../content/topic-look";
import { parseCollectionIdList } from "../collections/d1-collections";
import { parsePollOptions } from "../interactions/content-polls";
import { isCatalogSlug } from "./catalog";

export interface ContentDraftInput {
  title: string;
  description: string;
  category: string;
  tag: string;
  format: ContentFormat;
  kind: ContentKind;
  theme: ContentTheme;
  topics: string[];
  moods: string[];
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
  topic: string;
  sort: AdminSort;
  review: boolean;
  cursor: { sort: AdminSort; at: number; id: string } | null;
  limit: number;
}

const MAX_DRAFT_TOPICS = 8;
const MAX_DRAFT_MOODS = 6;

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

/** Danh sách slug catalog (chủ đề / tâm trạng) — format, không whitelist cứng. */
function slugList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) {
    return null;
  }

  const chosen: string[] = [];

  for (const item of value) {
    if (typeof item !== "string" || !isCatalogSlug(item)) return null;
    if (chosen.includes(item)) return null;
    chosen.push(item);
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

function parseMediaSizeFields(
  source: Record<string, unknown>
):
  | { ok: true; width: number | null; height: number | null }
  | { ok: false; error: string } {
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

  return { ok: true, width, height };
}

/**
 * Form biên tập: bài viết (chữ ± ảnh) | video | poll.
 * Có URL ảnh → format image; không → text. Theme DB cố định (atmosphere lo nền).
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
  const topics = slugList(source.topics, MAX_DRAFT_TOPICS);
  const moods = slugList(source.moods, MAX_DRAFT_MOODS);

  let kind: "story" | "video" | "poll" = "story";
  if (source.format === "poll") kind = "poll";
  else if (source.format === "video") kind = "video";
  else if (
    source.format !== undefined &&
    source.format !== "text" &&
    source.format !== "image"
  ) {
    return { ok: false, error: "Định dạng không hợp lệ." };
  }

  if (!title) {
    return {
      ok: false,
      error:
        kind === "poll"
          ? "Hãy nhập câu hỏi."
          : kind === "video"
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

  let format: ContentFormat = "text";
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

  if (kind === "video") {
    format = "video";
    const url = parseHttpsMediaUrl(source.imageUrl);
    if (!url) {
      return {
        ok: false,
        error: "Cần URL video HTTPS hoặc đường dẫn /api/media/… hợp lệ."
      };
    }

    const alt = parseImageAlt(source.imageAlt);
    if (alt === null) {
      return { ok: false, error: "Mô tả video quá dài." };
    }

    const sizes = parseMediaSizeFields(source);
    if (!sizes.ok) return sizes;

    imageUrl = url;
    imageAlt = alt;
    imageWidth = sizes.width;
    imageHeight = sizes.height;

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
  } else if (kind === "poll") {
    format = "poll";
    const options = parsePollOptions(source.pollOptions);
    if (!options) {
      return {
        ok: false,
        error: "Khảo sát cần 2 đến 4 đáp án khác nhau."
      };
    }
    pollOptions = options;
  } else {
    // Bài viết: ảnh tùy chọn → image; không ảnh → text.
    const rawUrl =
      typeof source.imageUrl === "string" ? source.imageUrl.trim() : "";
    if (rawUrl) {
      const url = parseHttpsMediaUrl(rawUrl);
      if (!url) {
        return {
          ok: false,
          error: "Cần URL ảnh HTTPS hoặc đường dẫn /api/media/… hợp lệ."
        };
      }

      const alt = parseImageAlt(source.imageAlt);
      if (alt === null) {
        return { ok: false, error: "Mô tả ảnh quá dài." };
      }

      const sizes = parseMediaSizeFields(source);
      if (!sizes.ok) return sizes;

      format = "image";
      imageUrl = url;
      imageAlt = alt;
      imageWidth = sizes.width;
      imageHeight = sizes.height;
    } else {
      format = "text";
    }
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
      body: format === "poll" ? "" : body,
      imageUrl,
      imageAlt,
      imageWidth,
      imageHeight,
      posterUrl,
      pollOptions,
      collectionIds,
      theme: DEFAULT_CONTENT_THEME,
      category: categoryForTopicSlug(topics[0])
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
    ? isCatalogSlug(topicValue)
      ? topicValue
      : null
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
