import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { adminJson } from "../../../features/admin/admin-http";
import { isContentStatus } from "../../../features/admin/change-content-status";
import {
  countSubmissions,
  listSubmissions
} from "../../../features/moderation/d1-submissions";
import { requireAdmin } from "../../../features/admin/require-admin";
import { decodeMyCursor } from "../../../features/interactions/my-reactions";

export const prerender = false;

const PAGE_SIZE = 10;

/**
 * GET /api/admin/submissions?status=draft|published|archived&cursor=
 * Bai nguoi dung gui. Trang dau kem so dem cua ca ba trang thai.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const status = url.searchParams.get("status") ?? "draft";
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? decodeMyCursor(rawCursor) : null;

  if (!isContentStatus(status) || (rawCursor && !cursor)) {
    return adminJson({ success: false, error: "Yêu cầu không hợp lệ." }, 400);
  }

  try {
    const [page, counts] = await Promise.all([
      listSubmissions(env.DB, status, cursor, PAGE_SIZE),
      cursor ? Promise.resolve(null) : countSubmissions(env.DB)
    ]);

    return adminJson(
      { success: true, ...page, ...(counts ? { counts } : {}) },
      200
    );
  } catch (error) {
    console.error("Admin submissions error:", error);
    return adminJson(
      { success: false, error: "Không tải được danh sách." },
      500
    );
  }
};
