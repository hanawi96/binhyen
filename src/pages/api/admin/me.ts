import type { APIRoute } from "astro";

import { requireAdminSession } from "../../../features/admin/require-admin";
import { adminJson } from "../../../features/admin/admin-http";

export const prerender = false;

/** GET /api/admin/me — thong tin admin dang dang nhap (neu co session DB). */
export const GET: APIRoute = async ({ request }) => {
  const access = await requireAdminSession(request);
  if (!access.ok) return access.response;

  return adminJson(
    {
      success: true,
      admin: access.admin,
      via: access.via
    },
    200
  );
};
