import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import type { ContentStatus } from "../../../../../features/content/content.types";
import {
  CONTENT_ID_PATTERN,
  adminJson
} from "../../../../../features/admin/admin-http";
import { changeContentStatus } from "../../../../../features/admin/change-content-status";
import { createD1ContentStatusStore } from "../../../../../features/admin/d1-content-status";
import { requireAdmin } from "../../../../../features/admin/require-admin";

export const prerender = false;

const ID_PATTERN = CONTENT_ID_PATTERN;

function isTargetStatus(value: unknown): value is ContentStatus {
  return (
    value === "draft" ||
    value === "published" ||
    value === "archived"
  );
}

/**
 * POST /api/admin/contents/:id/status
 *
 * Doi trang thai bang token Bearer. Khong dung cookie,
 * nen trinh duyet khong tu gui quyen nay.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const id = params.id;

  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    return adminJson(
      { success: false, error: "Invalid content id" },
      400
    );
  }

  let body: unknown;

  try {
    const text = await request.text();

    if (text.length > 2000) {
      return adminJson(
        { success: false, error: "Invalid request" },
        400
      );
    }

    body = JSON.parse(text);
  } catch {
    return adminJson(
      { success: false, error: "Invalid request" },
      400
    );
  }

  const status =
    body &&
    typeof body === "object" &&
    "status" in body
      ? body.status
      : undefined;

  if (!isTargetStatus(status)) {
    return adminJson(
      { success: false, error: "Invalid status" },
      400
    );
  }

  try {
    const result = await changeContentStatus(
      createD1ContentStatusStore(env.DB),
      id,
      status,
      Math.floor(Date.now() / 1000)
    );

    if (!result.ok && result.reason === "missing") {
      return adminJson(
        { success: false, error: "Content not found" },
        404
      );
    }

    if (!result.ok) {
      return adminJson(
        {
          success: false,
          error: "Content cannot change to that status"
        },
        409
      );
    }

    return adminJson(
      {
        success: true,
        id: result.id,
        status: result.status,
        publishedAt: result.publishedAt
      },
      200
    );
  } catch (error) {
    console.error("Admin status error:", error);

    return adminJson(
      { success: false, error: "Unable to update content" },
      500
    );
  }
};
