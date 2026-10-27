import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  listAdminUsers,
  parseUserListQuery
} from "../../../features/admin/d1-admin-users";
import { adminJson } from "../../../features/admin/admin-http";
import { requireAdmin } from "../../../features/admin/require-admin";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const query = parseUserListQuery({
    q: url.searchParams.get("q"),
    status: url.searchParams.get("status"),
    cursor: url.searchParams.get("cursor"),
    limit: url.searchParams.get("limit")
  });

  if (!query.ok) {
    return adminJson({ success: false, error: query.error }, 400);
  }

  const paging = Boolean(query.value.cursor);
  const includeTotal =
    url.searchParams.get("counts") === "1" ||
    (!paging && url.searchParams.get("counts") !== "0");

  try {
    const page = await listAdminUsers(env.DB, query.value, { includeTotal });
    return adminJson(
      {
        success: true,
        items: page.items,
        nextCursor: page.nextCursor,
        ...(page.total !== null ? { total: page.total } : {})
      },
      200
    );
  } catch (error) {
    console.error("List users error:", error);
    return adminJson(
      { success: false, error: "Không tải được danh sách." },
      500
    );
  }
};
