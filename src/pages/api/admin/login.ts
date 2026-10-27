import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { parseLogin, adminSessionCookie } from "../../../features/admin/admin-auth";
import { loginAdmin } from "../../../features/admin/d1-admin-accounts";
import { adminJson, readJsonBody } from "../../../features/admin/admin-http";

export const prerender = false;

/**
 * POST /api/admin/login
 * Dang nhap DB; neu chua co admin nao thi bootstrap tu env.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonBody(request, 2000);
  if (!body.ok) return body.response;

  const parsed = parseLogin(body.value);
  if (!parsed.ok) {
    return adminJson({ success: false, error: "Unauthorized" }, 401);
  }

  const result = await loginAdmin(
    env.DB,
    { username: parsed.username, password: parsed.password },
    {
      username: env.ADMIN_USERNAME,
      salt: env.ADMIN_PASSWORD_SALT,
      hash: env.ADMIN_PASSWORD_HASH
    }
  );

  if (!result.ok) {
    return adminJson({ success: false, error: "Unauthorized" }, 401);
  }

  const response = adminJson(
    {
      success: true,
      admin: {
        id: result.admin.id,
        username: result.admin.username,
        displayName: result.admin.displayName
      }
    },
    200
  );
  response.headers.append(
    "Set-Cookie",
    adminSessionCookie(
      result.token,
      new URL(request.url).protocol === "https:"
    )
  );
  return response;
};
