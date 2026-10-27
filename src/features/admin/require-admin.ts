import { env } from "cloudflare:workers";

import {
  findSessionAdmin,
  type PublicAdmin
} from "./d1-admin-accounts";
import {
  readBearerToken,
  readCookie,
  tokensMatch,
  ADMIN_COOKIE
} from "./admin-auth";
import { adminJson } from "./admin-http";

/**
 * Phien quan tri: cookie session DB, hoac Bearer ADMIN_TOKEN (may/script).
 */
export async function requireAdmin(
  request: Request
): Promise<Response | null> {
  const result = await resolveAdminRequest(request);
  return result.ok ? null : result.response;
}

export async function requireAdminSession(
  request: Request
): Promise<
  | { ok: true; admin: PublicAdmin | null; via: "session" | "token" }
  | { ok: false; response: Response }
> {
  return resolveAdminRequest(request);
}

async function resolveAdminRequest(
  request: Request
): Promise<
  | { ok: true; admin: PublicAdmin | null; via: "session" | "token" }
  | { ok: false; response: Response }
> {
  const unauthorized = adminJson(
    { success: false, error: "Unauthorized" },
    401
  );

  const bearer = readBearerToken(request.headers.get("Authorization"));
  if (bearer && tokensMatch(bearer, env.ADMIN_TOKEN)) {
    return { ok: true, admin: null, via: "token" };
  }

  const cookieToken =
    readCookie(request.headers.get("cookie"), ADMIN_COOKIE) ?? "";

  if (!cookieToken) {
    return { ok: false, response: unauthorized };
  }

  // Tuong thich cookie cu (ADMIN_TOKEN tinh) — cho phep 1 lan chuyen tiep.
  if (tokensMatch(cookieToken, env.ADMIN_TOKEN)) {
    return { ok: true, admin: null, via: "token" };
  }

  const admin = await findSessionAdmin(env.DB, cookieToken);
  if (!admin) {
    return { ok: false, response: unauthorized };
  }

  return { ok: true, admin, via: "session" };
}

export async function hasAdminAccess(
  cookieHeader: string | null
): Promise<boolean> {
  const cookieToken = readCookie(cookieHeader, ADMIN_COOKIE) ?? "";
  if (!cookieToken) return false;
  if (tokensMatch(cookieToken, env.ADMIN_TOKEN)) return true;
  const admin = await findSessionAdmin(env.DB, cookieToken);
  return Boolean(admin);
}
