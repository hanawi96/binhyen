import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  adminJson,
  CONTENT_ID_PATTERN,
  readJsonBody
} from "../../../../../features/admin/admin-http";
import { requireAdmin } from "../../../../../features/admin/require-admin";
import {
  CollectionError,
  setCollectionItems
} from "../../../../../features/collections/d1-collections";

export const prerender = false;

/**
 * PUT /api/admin/collections/:id/items
 * Body: { contentIds: string[] } — thu tu = mang.
 */
export const PUT: APIRoute = async ({ request, params }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  if (typeof params.id !== "string" || !CONTENT_ID_PATTERN.test(params.id)) {
    return adminJson({ success: false, error: "Invalid id" }, 400);
  }

  if (!env.DB) {
    return adminJson({ success: false, error: "Database unavailable." }, 503);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  if (!body.value || typeof body.value !== "object") {
    return adminJson({ success: false, error: "Invalid request" }, 400);
  }

  const contentIds = (body.value as Record<string, unknown>).contentIds;
  if (!Array.isArray(contentIds)) {
    return adminJson(
      { success: false, error: "Cần mảng contentIds." },
      400
    );
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const collection = await setCollectionItems(
      env.DB,
      params.id,
      contentIds.map((item) => String(item)),
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
    console.error("admin collection items error:", error);
    return adminJson(
      { success: false, error: "Không lưu được danh sách bài." },
      500
    );
  }
};
