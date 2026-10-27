import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { currentUser } from "../../../features/account/account";
import { createD1AccountStore } from "../../../features/account/d1-account-store";
import { isSecure } from "../../../features/account/account-http";
import { actorCookie, readActorId } from "../../../features/actor/actor";
import { interactionJson } from "../../../features/interactions/interaction-http";
import { createD1MyPostStore } from "../../../features/posts/d1-my-posts";

export const prerender = false;

/**
 * GET /api/auth/me — nguoi dung dang dang nhap (hoac null) va so bai
 * vua co ket qua duyet ma chua xem.
 * Neu cookie actor lech ma chinh cua tai khoan: gop + Set-Cookie lai.
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const store = createD1AccountStore(env.DB);
    const cookieHeader = request.headers.get("cookie");
    const user = await currentUser(store, cookieHeader, now);
    const postNews = user ? await createD1MyPostStore(env.DB).news(user.id) : 0;

    let setCookie: string | undefined;
    if (user) {
      const primary = await store.primaryActor(user.id);
      const cookieId = readActorId(cookieHeader);
      if (primary && cookieId !== primary) {
        if (cookieId) await store.mergeActor(cookieId, primary, now);
        setCookie = actorCookie(primary, isSecure(request));
      }
    }

    return interactionJson({ success: true, user, postNews }, 200, setCookie);
  } catch (error) {
    console.error("Me error:", error);
    return interactionJson(
      { success: false, error: "Unable to load account" },
      500
    );
  }
};
