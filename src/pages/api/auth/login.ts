import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { login } from "../../../features/account/account";
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
 * POST /api/auth/login  { email, password }
 * Thich / luu cua trinh duyet nay duoc gop vao tai khoan.
 */
export const POST: APIRoute = async ({ request }) => {
  const limited = await authLimited(env.AUTH_LIMITER, request);
  if (limited) return limited;

  const body = await readJsonBody(request);

  try {
    const result = await login(
      createD1AccountStore(env.DB),
      body,
      cookieActor(request),
      Math.floor(Date.now() / 1000)
    );

    if (!result.ok) {
      return result.reason === "wrong"
        ? interactionJson({ success: false, error: "Wrong credentials" }, 401)
        : interactionJson({ success: false, error: "Invalid request" }, 400);
    }

    return signedInResponse(request, result, 200);
  } catch (error) {
    console.error("Login error:", error);
    return interactionJson({ success: false, error: "Unable to log in" }, 500);
  }
};
