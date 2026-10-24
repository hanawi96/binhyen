import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { register } from "../../../features/account/account";
import {
  authLimited,
  cookieActor,
  signedInWithFeedMerge
} from "../../../features/account/account-http";
import { createD1AccountStore } from "../../../features/account/d1-account-store";
import {
  interactionJson,
  readJsonBody
} from "../../../features/interactions/interaction-http";

export const prerender = false;

/**
 * POST /api/auth/register  { email, password, displayName? }
 * Ma an danh dang dung tro thanh ma cua tai khoan moi;
 * lich su feed an danh chuyen sang khoa tai khoan.
 */
export const POST: APIRoute = async ({ request }) => {
  const limited = await authLimited(env.AUTH_LIMITER, request);
  if (limited) return limited;

  const body = await readJsonBody(request);
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await register(
      createD1AccountStore(env.DB),
      body,
      cookieActor(request),
      now
    );

    if (!result.ok) {
      return result.reason === "taken"
        ? interactionJson({ success: false, error: "Email taken" }, 409)
        : interactionJson({ success: false, error: "Invalid request" }, 400);
    }

    return signedInWithFeedMerge(env.DB, request, result, 201, now);
  } catch (error) {
    console.error("Register error:", error);
    return interactionJson(
      { success: false, error: "Unable to register" },
      500
    );
  }
};
