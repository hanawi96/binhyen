import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { readActorId } from "../../../features/actor/actor";
import { createD1MyReactionStore } from "../../../features/interactions/d1-my-reactions";
import { interactionJson } from "../../../features/interactions/interaction-http";
import {
  decodeMyCursor,
  parseMyKind,
  parseMyLimit
} from "../../../features/interactions/my-reactions";

export const prerender = false;

/**
 * GET /api/me/reactions?kind=like|save&cursor=&limit=
 * Bai da thich / da luu cua trinh duyet nay, moi nhat truoc.
 * Trang dau kem so dem cua ca hai tab. Khong tao cookie.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const kind = parseMyKind(url.searchParams.get("kind"));
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? decodeMyCursor(rawCursor) : null;

  if (!kind || (rawCursor && !cursor)) {
    return interactionJson({ success: false, error: "Invalid request" }, 400);
  }

  const actorId = readActorId(request.headers.get("cookie"));

  if (!actorId) {
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
      store.page(actorId, kind, cursor, limit),
      cursor ? Promise.resolve(null) : store.counts(actorId)
    ]);

    return interactionJson({
      success: true,
      ...page,
      ...(counts ? { counts } : {})
    });
  } catch (error) {
    console.error("My reactions error:", error);
    return interactionJson(
      { success: false, error: "Unable to load list" },
      500
    );
  }
};
