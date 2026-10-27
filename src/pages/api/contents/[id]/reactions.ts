import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { parseReactionRequest } from "../../../../features/interactions/content-reactions";
import { createD1ReactionStore } from "../../../../features/interactions/d1-reaction-store";
import {
  actorForRead,
  actorForWrite,
  checkWriteLimit,
  interactionJson,
  readJsonBody,
  tooManyInteractions,
  validContentId
} from "../../../../features/interactions/interaction-http";
import { InteractionLimitedError } from "../../../../features/interactions/rate-limit";

export const prerender = false;

/**
 * GET /api/contents/:id/reactions
 * Trang thai thich / luu — theo tai khoan neu dang nhap.
 */
export const GET: APIRoute = async ({ request, params }) => {
  if (!validContentId(params.id)) {
    return interactionJson({ success: false, error: "Invalid id" }, 400);
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const actor = await actorForRead(env.DB, request, now);
    const state = await createD1ReactionStore(env.DB).read(
      params.id,
      actor.id
    );

    if (!state) {
      return interactionJson({ success: false, error: "Not found" }, 404);
    }

    return interactionJson({ success: true, ...state }, 200, actor.setCookie);
  } catch (error) {
    console.error("Reaction read error:", error);
    return interactionJson(
      { success: false, error: "Unable to load reactions" },
      500
    );
  }
};

/**
 * POST /api/contents/:id/reactions  { kind: "like" | "save", on: boolean }
 * Dat trang thai, khong dao trang thai: gui lai cung lenh van an toan.
 */
export const POST: APIRoute = async ({ request, params }) => {
  if (!validContentId(params.id)) {
    return interactionJson({ success: false, error: "Invalid id" }, 400);
  }

  const reaction = parseReactionRequest(await readJsonBody(request));

  if (!reaction) {
    return interactionJson({ success: false, error: "Invalid request" }, 400);
  }

  const limited = await checkWriteLimit(env.INTERACTION_LIMITER, request);
  if (limited) return limited;

  try {
    const now = Math.floor(Date.now() / 1000);
    const actor = await actorForWrite(
      env.DB,
      env.NEW_ACTOR_LIMITER,
      request,
      now
    );
    const state = await createD1ReactionStore(env.DB).react(
      params.id,
      actor.id,
      reaction.kind,
      reaction.on,
      now
    );

    if (!state) {
      return interactionJson(
        { success: false, error: "Not found" },
        404,
        actor.setCookie
      );
    }

    return interactionJson({ success: true, ...state }, 200, actor.setCookie);
  } catch (error) {
    if (error instanceof InteractionLimitedError) return tooManyInteractions();
    console.error("Reaction write error:", error);
    return interactionJson(
      { success: false, error: "Unable to save reaction" },
      500
    );
  }
};
