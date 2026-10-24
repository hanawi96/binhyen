import type { ContentImage, ContentVideo } from "./content.types";
import { parseMediaUrl } from "../media/media-ref";

export type { ContentImage, ContentVideo };

const MAX_ALT = 200;

/** URL HTTPS ngoai hoac /api/media/... (R2). */
export const parseHttpsMediaUrl = parseMediaUrl;

/** @deprecated Ten cu — dung parseHttpsMediaUrl / parseMediaUrl. */
export const parseImageUrl = parseMediaUrl;

export function parseImageAlt(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const alt = value.trim().replace(/\s+/g, " ");
  return alt.length <= MAX_ALT ? alt : null;
}

export function parseImageSize(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  let size = value;
  if (typeof size === "string") {
    const trimmed = size.trim();
    if (!/^\d{1,5}$/.test(trimmed)) return null;
    size = Number(trimmed);
  }

  if (typeof size !== "number" || !Number.isInteger(size)) return null;
  if (size < 1 || size > 10000) return null;
  return size;
}

function parseMediaJson(value: unknown): Record<string, unknown> | null {
  let raw = value;

  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text || text === "null") return null;
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
  }

  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

/** Doc anh tu object hoac chuoi JSON embed trong feed. */
export function readContentImage(value: unknown): ContentImage | undefined {
  const row = parseMediaJson(value);
  if (!row) return undefined;

  const kind = typeof row.kind === "string" ? row.kind : "image";
  if (kind !== "image") return undefined;

  const url = typeof row.url === "string" ? row.url.trim() : "";
  if (!url) return undefined;

  return {
    url,
    alt: typeof row.alt === "string" ? row.alt : "",
    width: parseImageSize(row.width),
    height: parseImageSize(row.height)
  };
}

/** Doc video embed trong feed (kind = video). */
export function readContentVideo(value: unknown): ContentVideo | undefined {
  const row = parseMediaJson(value);
  if (!row) return undefined;

  if (row.kind !== "video") return undefined;

  const url = typeof row.url === "string" ? row.url.trim() : "";
  if (!url) return undefined;

  const posterRaw =
    typeof row.poster === "string"
      ? row.poster.trim()
      : typeof row.poster_url === "string"
        ? row.poster_url.trim()
        : "";

  return {
    url,
    alt: typeof row.alt === "string" ? row.alt : "",
    poster: posterRaw || null,
    width: parseImageSize(row.width),
    height: parseImageSize(row.height)
  };
}

/** Ti le CSS; anh mac dinh 4/5, video 16/9. */
export function mediaAspectRatio(
  media: { width: number | null; height: number | null } | undefined,
  fallback: string
): string {
  if (
    media?.width &&
    media.height &&
    media.width > 0 &&
    media.height > 0
  ) {
    return `${media.width} / ${media.height}`;
  }

  return fallback;
}

export function imageAspectRatio(image: ContentImage | undefined): string {
  return mediaAspectRatio(image, "4 / 5");
}

export function videoAspectRatio(video: ContentVideo | undefined): string {
  if (
    video?.width &&
    video.height &&
    video.width > 0 &&
    video.height > 0
  ) {
    return `${video.width} / ${video.height}`;
  }

  // Chua do duoc: ngang 16/9; tranh khung cao khi thieu metadata.
  return "16 / 9";
}

export function videoLayoutClass(
  video: ContentVideo | undefined
): "portrait" | "landscape" | "square" | "unknown" {
  if (!video?.width || !video.height) return "unknown";
  if (video.width === video.height) return "square";
  return video.height > video.width ? "portrait" : "landscape";
}
