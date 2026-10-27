import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  adminJson,
  CONTENT_ID_PATTERN,
  readJsonBody
} from "../../../../features/admin/admin-http";
import { requireAdmin } from "../../../../features/admin/require-admin";
import {
  CollectionError,
  deleteCollection,
  getCollectionById,
  parseCollectionDraft,
  updateCollection
} from "../../../../features/collections/d1-collections";

export const prerender = false;

function validId(id: string | undefined): id is string {
  return typeof id === "string" && CONTENT_ID_PATTERN.test(id);
}

/** GET /api/admin/collections/:id */
export const GET: APIRoute = async ({ request, params }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  if (!validId(params.id)) {
    return adminJson({ success: false, error: "Invalid id" }, 400);
  }

  if (!env.DB) {
    return adminJson({ success: false, error: "Database unavailable." }, 503);
  }

  try {
    const collection = await getCollectionById(env.DB, params.id);
    if (!collection) {
      return adminJson({ success: false, error: "Không tìm thấy." }, 404);
    }
    return adminJson({ success: true, collection }, 200);
  } catch (error) {
    console.error("admin collection get error:", error);
    return adminJson(
      { success: false, error: "Không tải được bộ sưu tập." },
      500
    );
  }
};

/** PATCH /api/admin/collections/:id */
export const PATCH: APIRoute = async ({ request, params }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  if (!validId(params.id)) {
    return adminJson({ success: false, error: "Invalid id" }, 400);
  }

  if (!env.DB) {
    return adminJson({ success: false, error: "Database unavailable." }, 503);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const draft = parseCollectionDraft(body.value);
  if (!draft.ok) {
    return adminJson({ success: false, error: draft.error }, 400);
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const collection = await updateCollection(
      env.DB,
      params.id,
      draft.value,
      now
    );
    return adminJson({ success: true, collection }, 200);
  } catch (error) {
    if (error instanceof CollectionError) {
      return adminJson(
        { success: false, error: error.message },
        error.statusCode
      );
    }
    console.error("admin collection patch error:", error);
    return adminJson(
      { success: false, error: "Không lưu được bộ sưu tập." },
      500
    );
  }
};

/** DELETE /api/admin/collections/:id */
export const DELETE: APIRoute = async ({ request, params }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  if (!validId(params.id)) {
    return adminJson({ success: false, error: "Invalid id" }, 400);
  }

  if (!env.DB) {
    return adminJson({ success: false, error: "Database unavailable." }, 503);
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const result = await deleteCollection(env.DB, params.id, now);
    if (!result) {
      return adminJson({ success: false, error: "Không tìm thấy." }, 404);
    }
    return adminJson({ success: true, ...result }, 200);
  } catch (error) {
    console.error("admin collection delete error:", error);
    return adminJson(
      { success: false, error: "Không xóa được bộ sưu tập." },
      500
    );
  }
};
