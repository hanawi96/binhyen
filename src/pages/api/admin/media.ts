import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { adminJson } from "../../../features/admin/admin-http";
import { requireAdmin } from "../../../features/admin/require-admin";
import {
  buildMediaKey,
  extensionForType,
  isMediaKind,
  maxBytesFor,
  mediaPublicPath,
  type MediaKind
} from "../../../features/media/media-ref";

export const prerender = false;

/**
 * POST /api/admin/media
 * multipart: file + kind=image|video|audio
 */
export const POST: APIRoute = async ({ request }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

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

  const kindRaw = form.get("kind");
  if (!isMediaKind(kindRaw)) {
    return adminJson(
      {
        success: false,
        error: "Loại media phải là image, video hoặc audio."
      },
      400
    );
  }

  const kind: MediaKind = kindRaw;
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return adminJson(
      { success: false, error: "Hãy chọn một tệp." },
      400
    );
  }

  const limit = maxBytesFor(kind);
  if (file.size > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    const label =
      kind === "video" ? "Video" : kind === "audio" ? "Nhạc" : "Ảnh";
    return adminJson(
      {
        success: false,
        error: `${label} tối đa ${mb} MB.`
      },
      400
    );
  }

  const ext = extensionForType(kind, file.type || "");
  if (!ext) {
    const hint =
      kind === "video"
        ? "Chỉ nhận MP4 hoặc WebM."
        : kind === "audio"
          ? "Chỉ nhận MP3, OGG, WebM hoặc M4A."
          : "Chỉ nhận JPEG, PNG hoặc WebP.";
    return adminJson({ success: false, error: hint }, 400);
  }

  if (kind === "image" && !file.type.startsWith("image/")) {
    return adminJson(
      { success: false, error: "Tệp không phải ảnh." },
      400
    );
  }

  if (kind === "video" && !file.type.startsWith("video/")) {
    return adminJson(
      { success: false, error: "Tệp không phải video." },
      400
    );
  }

  if (kind === "audio" && !file.type.startsWith("audio/")) {
    return adminJson(
      { success: false, error: "Tệp không phải nhạc." },
      400
    );
  }

  const key = buildMediaKey(kind, ext);
  const contentType = file.type.split(";")[0]?.trim() || "application/octet-stream";

  try {
    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable"
      },
      customMetadata: {
        kind,
        uploadedAt: String(Math.floor(Date.now() / 1000))
      }
    });
  } catch (error) {
    console.error("R2 media upload error:", error);
    return adminJson(
      { success: false, error: "Không lưu được tệp." },
      500
    );
  }

  return adminJson(
    {
      success: true,
      url: mediaPublicPath(key),
      key,
      contentType,
      bytes: file.size
    },
    200
  );
};
