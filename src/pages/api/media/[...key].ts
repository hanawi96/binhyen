import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { isSafeMediaKey } from "../../../features/media/media-ref";

export const prerender = false;

/**
 * GET /api/media/:key...
 * Stream tu R2; Range cho video. Audio tra full body (tranh Content-Range loi → Format error).
 */
export const GET: APIRoute = async ({ params, request }) => {
  const raw = params.key;
  const key = Array.isArray(raw) ? raw.join("/") : (raw ?? "");

  if (!key || !isSafeMediaKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  if (!env.MEDIA) {
    return new Response("Media unavailable", { status: 503 });
  }

  const isAudio = key.startsWith("audio/");
  // Audio HTML element rat ky voi Range sai; luon tra full file.
  const useRange = !isAudio && request.headers.has("range");

  try {
    const object = await env.MEDIA.get(
      key,
      useRange
        ? {
            range: request.headers,
            onlyIf: request.headers
          }
        : undefined
    );

    if (!object) {
      return new Response("Not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set(
      "cache-control",
      object.httpMetadata?.cacheControl ??
        "public, max-age=31536000, immutable"
    );
    headers.set("accept-ranges", isAudio ? "none" : "bytes");

    if (!headers.has("content-type")) {
      headers.set("content-type", guessContentType(key));
    }

    if (!("body" in object) || !object.body) {
      return new Response(null, { status: 304, headers });
    }

    if (useRange && object.range) {
      const normalized = normalizeRange(object.range, object.size);
      if (!normalized) {
        // Range khong parse duoc — tra full object.
        const full = await env.MEDIA.get(key);
        if (!full?.body) {
          return new Response("Not found", { status: 404 });
        }
        headers.set("content-length", String(full.size));
        headers.delete("content-range");
        return new Response(full.body, { status: 200, headers });
      }

      headers.set(
        "content-range",
        `bytes ${normalized.offset}-${normalized.offset + normalized.length - 1}/${object.size}`
      );
      headers.set("content-length", String(normalized.length));
      return new Response(object.body, { status: 206, headers });
    }

    headers.set("content-length", String(object.size));
    headers.delete("content-range");
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    console.error("R2 media serve error:", error);
    return new Response("Media error", { status: 500 });
  }
};

/** HEAD — metadata R2, khong stream body. */
export const HEAD: APIRoute = async ({ params }) => {
  const raw = params.key;
  const key = Array.isArray(raw) ? raw.join("/") : (raw ?? "");

  if (!key || !isSafeMediaKey(key)) {
    return new Response(null, { status: 404 });
  }

  if (!env.MEDIA) {
    return new Response(null, { status: 503 });
  }

  try {
    const object = await env.MEDIA.head(key);
    if (!object) {
      return new Response(null, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set(
      "cache-control",
      object.httpMetadata?.cacheControl ??
        "public, max-age=31536000, immutable"
    );
    headers.set("accept-ranges", key.startsWith("audio/") ? "none" : "bytes");
    headers.set("content-length", String(object.size));
    if (!headers.has("content-type")) {
      headers.set("content-type", guessContentType(key));
    }

    return new Response(null, { status: 200, headers });
  } catch (error) {
    console.error("R2 media HEAD error:", error);
    return new Response(null, { status: 500 });
  }
};

function guessContentType(key: string): string {
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".ogg")) return "audio/ogg";
  if (key.endsWith(".m4a")) return "audio/mp4";
  if (key.endsWith(".webm")) return "audio/webm";
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function normalizeRange(
  range: R2Range,
  size: number
): { offset: number; length: number } | null {
  if (!Number.isFinite(size) || size < 0) return null;

  if ("suffix" in range) {
    const suffix = Number(range.suffix);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    return { offset: Math.max(0, size - length), length };
  }

  const offset = Number(range.offset ?? 0);
  if (!Number.isFinite(offset) || offset < 0 || offset >= size) return null;

  const rawLength =
    range.length === undefined || range.length === null
      ? size - offset
      : Number(range.length);

  if (!Number.isFinite(rawLength) || rawLength <= 0) return null;

  const length = Math.min(rawLength, size - offset);
  if (length <= 0) return null;

  return { offset, length };
}
