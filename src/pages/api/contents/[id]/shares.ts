import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { parseShareChannel } from "../../../../features/interactions/content-reactions";
import { createD1ReactionStore } from "../../../../features/interactions/d1-reaction-store";
import {
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
 * POST /api/contents/:id/shares  { channel: "native" | "copy_link" | "other" }
 * Chi goi sau khi chia se thanh cong o trinh duyet.
 */
export const POST: APIRoute = async ({ request, params }) => {
  if (!validContentId(params.id)) {
    return interactionJson({ success: false, error: "Invalid id" }, 400);
  }

  const channel = parseShareChannel(await readJsonBody(request));

  if (!channel) {
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
    const state = await createD1ReactionStore(env.DB).share(
      params.id,
      actor.id,
      channel,
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
    console.error("Share write error:", error);
    return interactionJson(
      { success: false, error: "Unable to save share" },
      500
    );
  }
};
