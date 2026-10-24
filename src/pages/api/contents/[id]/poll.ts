import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { readActorId } from "../../../../features/actor/actor";
import { parsePollVote } from "../../../../features/interactions/content-polls";
import { createD1PollStore } from "../../../../features/interactions/d1-poll-store";
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
 * GET /api/contents/:id/poll
 * Dap an khao sat. Chua binh chon thi chua hien %.
 */
export const GET: APIRoute = async ({ request, params }) => {
  if (!validContentId(params.id)) {
    return interactionJson({ success: false, error: "Invalid id" }, 400);
  }

  try {
    const state = await createD1PollStore(env.DB).read(
      params.id,
      readActorId(request.headers.get("cookie"))
    );

    if (!state) {
      return interactionJson({ success: false, error: "Not found" }, 404);
    }

    return interactionJson({ success: true, ...state });
  } catch (error) {
    console.error("Poll read error:", error);
    return interactionJson(
      { success: false, error: "Unable to load poll" },
      500
    );
  }
};

/**
 * POST /api/contents/:id/poll  { optionId: "o1" | "o2" | "o3" | "o4" }
 * Mot lan / trinh duyet; gui lai khong doi dap an.
 */
export const POST: APIRoute = async ({ request, params }) => {
  if (!validContentId(params.id)) {
    return interactionJson({ success: false, error: "Invalid id" }, 400);
  }

  const vote = parsePollVote(await readJsonBody(request));

  if (!vote) {
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
    const state = await createD1PollStore(env.DB).vote(
      params.id,
      actor.id,
      vote.optionId,
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
    console.error("Poll vote error:", error);
    return interactionJson(
      { success: false, error: "Unable to save vote" },
      500
    );
  }
};
