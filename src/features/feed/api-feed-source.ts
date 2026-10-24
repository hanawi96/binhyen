
import type { ContentItem } from "../content/content.types";
import type {
  TopicFilter,
  MoodFilter
} from "../content/filter-contents";
import type { FeedPage } from "./feed-source";

const FIRST_CURSOR = "__first__";
const DEFAULT_TIMEOUT_MS = 10000;

export type FeedFailure =
  | "aborted"
  | "timeout"
  | "network"
  | "http"
  | "invalid";

export class FeedLoadError extends Error {
  readonly reason: FeedFailure;

  constructor(reason: FeedFailure, message: string) {
    super(message);
    this.name = "FeedLoadError";
    this.reason = reason;
  }
}

export function isFeedAbort(error: unknown): boolean {
  return (
    error instanceof FeedLoadError &&
    error.reason === "aborted"
  );
}

interface FeedRequest {
  signal: AbortSignal;
  dispose: () => void;
}

export function createFeedRequest(
  userSignal: AbortSignal | undefined,
  timeoutMs: number
): FeedRequest {
  const controller = new AbortController();
  let settled = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
  };

  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    controller.abort(
      new DOMException(
        "The operation timed out.",
        "TimeoutError"
      )
    );
  }, timeoutMs);

  const abortFromUser = () => {
    finish();
    if (!controller.signal.aborted) {
      controller.abort(userSignal?.reason);
    }
  };

  if (userSignal?.aborted) {
    abortFromUser();
  } else {
    userSignal?.addEventListener("abort", abortFromUser, {
      once: true
    });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      finish();
      userSignal?.removeEventListener("abort", abortFromUser);
    }
  };
}

function failureFromFetch(
  error: unknown,
  requestSignal: AbortSignal,
  userSignal: AbortSignal | undefined
): FeedLoadError {
  if (error instanceof FeedLoadError) return error;

  if (userSignal?.aborted) {
    return new FeedLoadError("aborted", "Feed request aborted");
  }

  const reason = requestSignal.aborted
    ? requestSignal.reason
    : error;
  const name = reason instanceof Error ? reason.name : "";

  if (name === "TimeoutError") {
    return new FeedLoadError("timeout", "Feed request timed out");
  }

  if (requestSignal.aborted || name === "AbortError") {
    return new FeedLoadError("aborted", "Feed request aborted");
  }

  return new FeedLoadError("network", "Feed request failed");
}

interface ApiResponse {
  success: boolean;
  items: ContentItem[];
  nextCursor: string | null;
  hasMore: boolean;
  matched?: boolean;
  pageCursor?: string | null;
  notice?: "all-seen" | null;
}

function optionalMediaUrl(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalSize(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 10000)
  );
}

function isContentImage(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const image = value as Record<string, unknown>;
  return (
    optionalMediaUrl(image.url) &&
    typeof image.alt === "string" &&
    optionalSize(image.width) &&
    optionalSize(image.height)
  );
}

function isContentVideo(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const video = value as Record<string, unknown>;
  return (
    optionalMediaUrl(video.url) &&
    typeof video.alt === "string" &&
    (video.poster === null || optionalMediaUrl(video.poster)) &&
    optionalSize(video.width) &&
    optionalSize(video.height)
  );
}

function isPollOptions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) {
    return false;
  }

  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") return false;
    const option = entry as Record<string, unknown>;
    if (typeof option.id !== "string" || !/^o[1-4]$/.test(option.id)) {
      return false;
    }
    if (typeof option.label !== "string" || !option.label.trim()) {
      return false;
    }
    if (seen.has(option.id)) return false;
    seen.add(option.id);
  }

  return true;
}

function isContent(value: unknown): value is ContentItem {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;

  const optionalCount = (value: unknown) =>
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0);

  const optionalFlag = (value: unknown) =>
    value === undefined || typeof value === "boolean";

  return (
    typeof item.id === "string" &&
    typeof item.slug === "string" &&
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    typeof item.category === "string" &&
    typeof item.tag === "string" &&
    typeof item.kind === "string" &&
    typeof item.theme === "string" &&
    item.status === "published" &&
    Array.isArray(item.topics) &&
    item.topics.every((x) => typeof x === "string") &&
    Array.isArray(item.suitableMoods) &&
    item.suitableMoods.every((x) => typeof x === "string") &&
    optionalCount(item.likeCount) &&
    optionalCount(item.saveCount) &&
    optionalCount(item.shareCount) &&
    optionalFlag(item.liked) &&
    optionalFlag(item.saved) &&
    isContentImage(item.image) &&
    isContentVideo(item.video) &&
    isPollOptions(item.pollOptions)
  );
}

interface ApiFeedOptions {
  section?: "loved";
  origin?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function pageOrigin(origin: string | undefined): string {
  if (origin) return origin;
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/**
 * Tao nguon du lieu tu API thay cho demoContents.
 *
 * Moi lan tai tra dung mot trang server da xep.
 * Frontend khong truy cap database truc tiep.
 */
export function createApiFeedSource(
  topic: TopicFilter,
  mood: MoodFilter,
  options: ApiFeedOptions = {}
) {
  const completed = new Set<string>();

  return {
    firstPage(_pageSize: number): FeedPage {
      return {
        items: [],
        nextCursor: FIRST_CURSOR
      };
    },

    async loadPage(
      cursor: string,
      pageSize: number,
      userSignal?: AbortSignal
    ): Promise<FeedPage> {
      const size = Math.max(
        1,
        Math.min(20, Math.floor(pageSize) || 3)
      );
      const origin = pageOrigin(options.origin);

      if (!origin) {
        throw new FeedLoadError(
          "network",
          "Feed API is only available in the browser"
        );
      }

      const fetchPage = options.fetch ?? fetch;
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      if (completed.has(cursor)) {
        throw new FeedLoadError(
          "invalid",
          "Repeated feed cursor"
        );
      }

      const url = new URL("/api/feed", origin);
      url.searchParams.set("limit", String(size));

      if (options.section) {
        url.searchParams.set("section", options.section);
      } else {
        url.searchParams.set("topic", topic);
        url.searchParams.set("mood", mood);
      }

      if (cursor !== FIRST_CURSOR) {
        url.searchParams.set("cursor", cursor);
      }

      const request = createFeedRequest(
        userSignal,
        timeoutMs
      );

      let response: Response;

      try {
        response = await fetchPage(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: request.signal
        });
      } catch (error) {
        throw failureFromFetch(
          error,
          request.signal,
          userSignal
        );
      } finally {
        request.dispose();
      }

      if (!response.ok) {
        throw new FeedLoadError(
          "http",
          `Feed API HTTP ${response.status}`
        );
      }

      let data: unknown;

      try {
        data = await response.json();
      } catch {
        throw new FeedLoadError(
          "invalid",
          "Invalid API response"
        );
      }

      if (!data || typeof data !== "object") {
        throw new FeedLoadError(
          "invalid",
          "Invalid API response"
        );
      }

      const payload = data as Partial<ApiResponse>;

      if (
        payload.success !== true ||
        !Array.isArray(payload.items) ||
        !payload.items.every(isContent) ||
        !(
          payload.nextCursor === null ||
          typeof payload.nextCursor === "string"
        ) ||
        !(
          payload.matched === undefined ||
          typeof payload.matched === "boolean"
        ) ||
        !(
          payload.pageCursor === undefined ||
          payload.pageCursor === null ||
          typeof payload.pageCursor === "string"
        ) ||
        !(
          payload.notice === undefined ||
          payload.notice === null ||
          payload.notice === "all-seen"
        )
      ) {
        throw new FeedLoadError("invalid", "Invalid feed data");
      }

      completed.add(cursor);

      return {
        items: payload.items,
        nextCursor: payload.nextCursor,
        matched: payload.matched,
        pageCursor: payload.pageCursor ?? null,
        notice: payload.notice ?? null
      };
    }
  };
}

interface CollectionFeedOptions {
  origin?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Nguon feed bo suu tap: GET /api/collections/:slug/feed
 * Khong dung topic/mood/seen.
 */
export function createCollectionFeedSource(
  slug: string,
  options: CollectionFeedOptions = {}
) {
  const completed = new Set<string>();

  return {
    firstPage(_pageSize: number): FeedPage {
      return {
        items: [],
        nextCursor: FIRST_CURSOR
      };
    },

    async loadPage(
      cursor: string,
      pageSize: number,
      userSignal?: AbortSignal
    ): Promise<FeedPage> {
      const size = Math.max(1, Math.min(20, Math.floor(pageSize) || 3));
      const origin = pageOrigin(options.origin);

      if (!origin) {
        throw new FeedLoadError(
          "network",
          "Feed API is only available in the browser"
        );
      }

      const fetchPage = options.fetch ?? fetch;
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      if (completed.has(cursor)) {
        throw new FeedLoadError("invalid", "Repeated feed cursor");
      }

      const url = new URL(
        `/api/collections/${encodeURIComponent(slug)}/feed`,
        origin
      );
      url.searchParams.set("limit", String(size));
      if (cursor !== FIRST_CURSOR) {
        url.searchParams.set("cursor", cursor);
      }

      const request = createFeedRequest(userSignal, timeoutMs);

      let response: Response;

      try {
        response = await fetchPage(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: request.signal
        });
      } catch (error) {
        throw failureFromFetch(error, request.signal, userSignal);
      } finally {
        request.dispose();
      }

      if (!response.ok) {
        throw new FeedLoadError(
          "http",
          `Collection feed HTTP ${response.status}`
        );
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new FeedLoadError("invalid", "Invalid API response");
      }

      if (!data || typeof data !== "object") {
        throw new FeedLoadError("invalid", "Invalid API response");
      }

      const payload = data as Partial<ApiResponse>;

      if (
        payload.success !== true ||
        !Array.isArray(payload.items) ||
        !payload.items.every(isContent) ||
        !(
          payload.nextCursor === null ||
          typeof payload.nextCursor === "string"
        )
      ) {
        throw new FeedLoadError("invalid", "Invalid feed data");
      }

      completed.add(cursor);

      return {
        items: payload.items,
        nextCursor: payload.nextCursor,
        matched: true
      };
    }
  };
}
