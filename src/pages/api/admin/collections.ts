import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { adminJson, readJsonBody } from "../../../features/admin/admin-http";
import { requireAdmin } from "../../../features/admin/require-admin";
import {
  CollectionError,
  createCollection,
  listCollectionsAdmin,
  parseCollectionDraft
} from "../../../features/collections/d1-collections";

export const prerender = false;

/** GET /api/admin/collections */
export const GET: APIRoute = async ({ request }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  if (!env.DB) {
    return adminJson({ success: false, error: "Database unavailable." }, 503);
  }

  try {
    const collections = await listCollectionsAdmin(env.DB);
    return adminJson({ success: true, collections }, 200);
  } catch (error) {
    console.error("admin collections list error:", error);
    return adminJson(
      { success: false, error: "Không tải được bộ sưu tập." },
      500
    );
  }
};

/** POST /api/admin/collections */
export const POST: APIRoute = async ({ request }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

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
    const collection = await createCollection(env.DB, draft.value, now);
    return adminJson({ success: true, collection }, 201);
  } catch (error) {
    if (error instanceof CollectionError) {
      return adminJson(
        { success: false, error: error.message },
        error.statusCode
      );
    }
    console.error("admin collections create error:", error);
    return adminJson(
      { success: false, error: "Không tạo được bộ sưu tập." },
      500
    );
  }
};
