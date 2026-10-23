import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { acceptAdminLogin, adminSessionCookie } from "../../../features/admin/admin-auth";
import { adminJson, readJsonBody } from "../../../features/admin/admin-http";

export const prerender = false;

/**
 * POST /api/admin/login
 *
 * Doi ten va mat khau lay cookie phien. Cookie chi gui cung goc.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonBody(request, 2000);
  if (!body.ok) return body.response;

  const result = await acceptAdminLogin(body.value, {
    username: env.ADMIN_USERNAME,
    salt: env.ADMIN_PASSWORD_SALT,
    hash: env.ADMIN_PASSWORD_HASH,
    token: env.ADMIN_TOKEN
  });

  if (!result.ok) {
    return adminJson(
      { success: false, error: "Unauthorized" },
      401
    );
  }

  const response = adminJson({ success: true }, 200);
  response.headers.append(
    "Set-Cookie",
    adminSessionCookie(
      result.token,
      new URL(request.url).protocol === "https:"
    )
  );
  return response;
};
