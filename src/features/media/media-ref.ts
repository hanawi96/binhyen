/** Tham chieu media: HTTPS ngoai hoac duong dan /api/media/... (R2). */

export type MediaKind = "image" | "video" | "audio";

const MAX_REF = 500;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm"
};

const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a"
};

const LOCAL_MEDIA =
  /^\/api\/media\/((?:image|video|audio)\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(?:jpe?g|png|webp|mp4|webm|mp3|ogg|m4a))$/i;

export const MEDIA_LIMITS = {
  imageBytes: 2 * 1024 * 1024,
  videoBytes: 16 * 1024 * 1024,
  audioBytes: 8 * 1024 * 1024
} as const;

export function extensionForType(
  kind: MediaKind,
  contentType: string
): string | null {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (kind === "image") return IMAGE_TYPES[type] ?? null;
  if (kind === "video") return VIDEO_TYPES[type] ?? null;
  return AUDIO_TYPES[type] ?? null;
}

export function maxBytesFor(kind: MediaKind): number {
  if (kind === "video") return MEDIA_LIMITS.videoBytes;
  if (kind === "audio") return MEDIA_LIMITS.audioBytes;
  return MEDIA_LIMITS.imageBytes;
}

export function isMediaKind(value: unknown): value is MediaKind {
  return value === "image" || value === "video" || value === "audio";
}

/** Key an toan trong bucket (khong co ..). */
export function isSafeMediaKey(key: string): boolean {
  return (
    /^(image|video|audio)\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(jpe?g|png|webp|mp4|webm|mp3|ogg|m4a)$/i.test(
      key
    ) && !key.includes("..")
  );
}

export function mediaPublicPath(key: string): string {
  return `/api/media/${key}`;
}

export function mediaKeyFromPath(path: string): string | null {
  const match = LOCAL_MEDIA.exec(path.trim());
  return match?.[1] ?? null;
}

export function buildMediaKey(kind: MediaKind, ext: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${kind}/${year}/${month}/${id}.${ext}`;
}

/**
 * Chap nhan https://... hoac /api/media/image|video|audio/...
 */
export function parseMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || url.length > MAX_REF) return null;

  const local = mediaKeyFromPath(url);
  if (local) return mediaPublicPath(local);

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
