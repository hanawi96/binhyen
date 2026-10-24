import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { register } from "../../../features/account/account";
import {
  authLimited,
  cookieActor,
  signedInResponse
} from "../../../features/account/account-http";
import { createD1AccountStore } from "../../../features/account/d1-account-store";
import {
  interactionJson,
  readJsonBody
} from "../../../features/interactions/interaction-http";

export const prerender = false;

/**
 * POST /api/auth/register  { email, password, displayName? }
 * Ma an danh dang dung tro thanh ma cua tai khoan moi.
 */
export const POST: APIRoute = async ({ request }) => {
  const limited = await authLimited(env.AUTH_LIMITER, request);
  if (limited) return limited;

  const body = await readJsonBody(request);

  try {
    const result = await register(
      createD1AccountStore(env.DB),
      body,
      cookieActor(request),
      Math.floor(Date.now() / 1000)
    );

    if (!result.ok) {
      return result.reason === "taken"
        ? interactionJson({ success: false, error: "Email taken" }, 409)
        : interactionJson({ success: false, error: "Invalid request" }, 400);
    }

    return signedInResponse(request, result, 201);
  } catch (error) {
    console.error("Register error:", error);
    return interactionJson(
      { success: false, error: "Unable to register" },
      500
    );
  }
};
