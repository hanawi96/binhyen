import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { currentUser } from "../../../features/account/account";
import { createD1AccountStore } from "../../../features/account/d1-account-store";
import { interactionJson } from "../../../features/interactions/interaction-http";
import { createD1MyPostStore } from "../../../features/posts/d1-my-posts";

export const prerender = false;

/**
 * GET /api/auth/me — nguoi dung dang dang nhap (hoac null) va so bai
 * vua co ket qua duyet ma chua xem.
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const user = await currentUser(
      createD1AccountStore(env.DB),
      request.headers.get("cookie"),
      Math.floor(Date.now() / 1000)
    );
    const postNews = user ? await createD1MyPostStore(env.DB).news(user.id) : 0;

    return interactionJson({ success: true, user, postNews });
  } catch (error) {
    console.error("Me error:", error);
    return interactionJson(
      { success: false, error: "Unable to load account" },
      500
    );
  }
};
