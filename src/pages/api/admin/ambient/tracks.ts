import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { adminJson } from "../../../../features/admin/admin-http";
import { requireAdmin } from "../../../../features/admin/require-admin";
import {
  insertAmbientTrack,
  listAmbientTracks,
  normalizeAmbientTitle
} from "../../../../features/ambient/d1-ambient-tracks";
import {
  buildMediaKey,
  extensionForType,
  maxBytesFor,
  mediaPublicPath
} from "../../../../features/media/media-ref";

export const prerender = false;

/** GET /api/admin/ambient/tracks */
export const GET: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  if (!env.DB) {
    return adminJson({ success: false, error: "Database unavailable." }, 503);
  }

  try {
    const tracks = await listAmbientTracks(env.DB);
    return adminJson({ success: true, tracks }, 200);
  } catch (error) {
    console.error("admin ambient list error:", error);
    return adminJson(
      { success: false, error: "Không tải được danh sách nhạc." },
      500
    );
  }
};

/**
 * POST /api/admin/ambient/tracks
 * multipart: file + title + makeDefault?=1
 */
export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  if (!env.DB) {
    return adminJson({ success: false, error: "Database unavailable." }, 503);
  }

  if (!env.MEDIA) {
    return adminJson(
      { success: false, error: "Kho media chưa sẵn sàng." },
      503
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return adminJson(
      { success: false, error: "Không đọc được tệp tải lên." },
      400
    );
  }

  const title = normalizeAmbientTitle(form.get("title"));
  if (!title) {
    return adminJson(
      { success: false, error: "Tên bài 1–80 ký tự." },
      400
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return adminJson({ success: false, error: "Hãy chọn một tệp nhạc." }, 400);
  }

  const limit = maxBytesFor("audio");
  if (file.size > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    return adminJson(
      { success: false, error: `Nhạc tối đa ${mb} MB.` },
      400
    );
  }

  if (!file.type.startsWith("audio/")) {
    return adminJson({ success: false, error: "Tệp không phải nhạc." }, 400);
  }

  const ext = extensionForType("audio", file.type || "");
  if (!ext) {
    return adminJson(
      { success: false, error: "Chỉ nhận MP3, OGG, WebM hoặc M4A." },
      400
    );
  }

  const makeDefault =
    form.get("makeDefault") === "1" || form.get("makeDefault") === "true";

  const key = buildMediaKey("audio", ext);
  const contentType =
    file.type.split(";")[0]?.trim() || "application/octet-stream";

  try {
    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable"
      },
      customMetadata: {
        kind: "audio",
        uploadedAt: String(Math.floor(Date.now() / 1000))
      }
    });
  } catch (error) {
    console.error("R2 ambient upload error:", error);
    return adminJson({ success: false, error: "Không lưu được tệp." }, 500);
  }

  const url = mediaPublicPath(key);

  try {
    const track = await insertAmbientTrack(env.DB, {
      title,
      url,
      makeDefault
    });
    return adminJson({ success: true, track }, 201);
  } catch (error) {
    console.error("ambient track insert error:", error);
    try {
      await env.MEDIA.delete(key);
    } catch {
      /* ignore rollback failure */
    }
    return adminJson(
      { success: false, error: "Không lưu được bài nhạc." },
      500
    );
  }
};
