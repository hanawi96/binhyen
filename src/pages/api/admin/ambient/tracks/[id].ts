import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { adminJson, readJsonBody } from "../../../../../features/admin/admin-http";
import { requireAdmin } from "../../../../../features/admin/require-admin";
import {
  deleteAmbientTrack,
  normalizeAmbientTitle,
  setDefaultAmbientTrack,
  updateAmbientTrackTitle
} from "../../../../../features/ambient/d1-ambient-tracks";
import {
  deleteLocalMediaKeys
} from "../../../../../features/media/media-gc";
import { mediaKeyFromPath } from "../../../../../features/media/media-ref";

export const prerender = false;

const ID_RE = /^[0-9a-f-]{36}$/i;

function readId(params: { id?: string | string[] }): string | null {
  const raw = params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || !ID_RE.test(id)) return null;
  return id;
}

/** PATCH /api/admin/ambient/tracks/:id — { title? } | { makeDefault: true } */
export const PATCH: APIRoute = async ({ request, params }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  if (!env.DB) {
    return adminJson({ success: false, error: "Database unavailable." }, 503);
  }

  const id = readId(params);
  if (!id) {
    return adminJson({ success: false, error: "Id không hợp lệ." }, 400);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  if (!body.value || typeof body.value !== "object") {
    return adminJson({ success: false, error: "JSON không hợp lệ." }, 400);
  }

  const payload = body.value as Record<string, unknown>;

  try {
    if (payload.makeDefault === true) {
      const track = await setDefaultAmbientTrack(env.DB, id);
      if (!track) {
        return adminJson({ success: false, error: "Không tìm thấy bài." }, 404);
      }
      return adminJson({ success: true, track }, 200);
    }

    if ("title" in payload) {
      const title = normalizeAmbientTitle(payload.title);
      if (!title) {
        return adminJson(
          { success: false, error: "Tên bài 1–80 ký tự." },
          400
        );
      }
      const track = await updateAmbientTrackTitle(env.DB, id, title);
      if (!track) {
        return adminJson({ success: false, error: "Không tìm thấy bài." }, 404);
      }
      return adminJson({ success: true, track }, 200);
    }

    return adminJson(
      { success: false, error: "Không có trường để cập nhật." },
      400
    );
  } catch (error) {
    console.error("admin ambient patch error:", error);
    return adminJson({ success: false, error: "Không cập nhật được." }, 500);
  }
};

/** DELETE /api/admin/ambient/tracks/:id */
export const DELETE: APIRoute = async ({ request, params }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  if (!env.DB) {
    return adminJson({ success: false, error: "Database unavailable." }, 503);
  }

  const id = readId(params);
  if (!id) {
    return adminJson({ success: false, error: "Id không hợp lệ." }, 400);
  }

  try {
    const removed = await deleteAmbientTrack(env.DB, id);
    if (!removed) {
      return adminJson({ success: false, error: "Không tìm thấy bài." }, 404);
    }

    const key = mediaKeyFromPath(removed.url);
    if (key) {
      await deleteLocalMediaKeys(env.MEDIA, [key]);
    }

    return adminJson({ success: true, id: removed.id }, 200);
  } catch (error) {
    console.error("admin ambient delete error:", error);
    return adminJson({ success: false, error: "Không xóa được." }, 500);
  }
};
