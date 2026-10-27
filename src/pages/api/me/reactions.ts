import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createD1MyReactionStore } from "../../../features/interactions/d1-my-reactions";
import {
  actorForRead,
  interactionJson
} from "../../../features/interactions/interaction-http";
import {
  decodeMyCursor,
  parseMyKind,
  parseMyLimit
} from "../../../features/interactions/my-reactions";

export const prerender = false;

/**
 * GET /api/me/reactions?kind=like|save&cursor=&limit=
 * Bai da thich / da luu — theo tai khoan neu dang nhap, khong thi cookie.
 * Trang dau kem so dem cua ca hai tab.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const kind = parseMyKind(url.searchParams.get("kind"));
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? decodeMyCursor(rawCursor) : null;

  if (!kind || (rawCursor && !cursor)) {
    return interactionJson({ success: false, error: "Invalid request" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const actor = await actorForRead(env.DB, request, now);

  if (!actor.id) {
    return interactionJson({
      success: true,
      items: [],
      nextCursor: null,
      ...(cursor ? {} : { counts: { liked: 0, saved: 0 } })
    });
  }

  try {
    const store = createD1MyReactionStore(env.DB);
    const limit = parseMyLimit(url.searchParams.get("limit"));
    const [page, counts] = await Promise.all([
      store.page(actor.id, kind, cursor, limit),
      cursor ? Promise.resolve(null) : store.counts(actor.id)
    ]);

    return interactionJson(
      {
        success: true,
        ...page,
        ...(counts ? { counts } : {})
      },
      200,
      actor.setCookie
    );
  } catch (error) {
    console.error("My reactions error:", error);
    return interactionJson(
      { success: false, error: "Unable to load list" },
      500
    );
  }
};
