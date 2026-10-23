import { env } from "cloudflare:workers";

import { readBearerToken, readCookie, tokensMatch, ADMIN_COOKIE } from "./admin-auth";
import { adminJson } from "./admin-http";

/**
 * Phien quan tri la cookie HttpOnly cung goc, hoac Bearer.
 * Thieu hoac sai deu tra cung mot cau.
 */
export function requireAdmin(request: Request): Response | null {
  const presented =
    readBearerToken(request.headers.get("Authorization")) ??
    readCookie(request.headers.get("cookie"), ADMIN_COOKIE) ??
    "";

  if (!tokensMatch(presented, env.ADMIN_TOKEN)) {
    return adminJson(
      { success: false, error: "Unauthorized" },
      401
    );
  }

  return null;
}
