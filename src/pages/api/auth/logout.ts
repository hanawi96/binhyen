import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { logout, signOutCookies } from "../../../features/account/account";
import { isSecure } from "../../../features/account/account-http";
import { createD1AccountStore } from "../../../features/account/d1-account-store";
import {
  interactionJson,
  readJsonBody
} from "../../../features/interactions/interaction-http";

export const prerender = false;

/**
 * POST /api/auth/logout
 * Body JSON rong de trang khac khong goi duoc ma khong qua CORS.
 */
export const POST: APIRoute = async ({ request }) => {
  if ((await readJsonBody(request)) === undefined) {
    return interactionJson({ success: false, error: "Invalid request" }, 400);
  }

  try {
    await logout(createD1AccountStore(env.DB), request.headers.get("cookie"));
  } catch (error) {
    console.error("Logout error:", error);
  }

  const response = interactionJson({ success: true });
  for (const cookie of signOutCookies(isSecure(request))) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
};
