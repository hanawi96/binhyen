import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  ADMIN_COOKIE,
  clearAdminSessionCookie,
  readCookie
} from "../../../features/admin/admin-auth";
import { deleteAdminSession } from "../../../features/admin/d1-admin-accounts";
import { adminJson } from "../../../features/admin/admin-http";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const token = readCookie(request.headers.get("cookie"), ADMIN_COOKIE);
  if (token) {
    try {
      await deleteAdminSession(env.DB, token);
    } catch {
      // Van xoa cookie du DB loi.
    }
  }

  const response = adminJson({ success: true }, 200);
  response.headers.append(
    "Set-Cookie",
    clearAdminSessionCookie(new URL(request.url).protocol === "https:")
  );
  return response;
};
