import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  ViewerStateBusyError,
  readFeedViewer,
  recordSeen
} from "../../../features/feed/d1-viewer-state";
import { parseSeenReport, SEEN_BODY_LIMIT } from "../../../features/feed/seen-report";
import { actorViewerKey, userViewerKey } from "../../../features/feed/viewer-key";
import {
  actorForWrite,
  checkWriteLimit,
  interactionJson,
  readJsonBody,
  tooManyInteractions
} from "../../../features/interactions/interaction-http";
import { InteractionLimitedError } from "../../../features/interactions/rate-limit";

export const prerender = false;

const BUSY_RETRY_SECONDS = 2;

/**
 * POST /api/feed/seen  { ids: string[], cursor?: string | null }
 * Bao cac the da hien on dinh. Gui lai cung lo van an toan.
 * Nguoi chua co ma an danh duoc tao ma o lan bao dau tien.
 */
export const POST: APIRoute = async ({ request }) => {
  const report = parseSeenReport(await readJsonBody(request, SEEN_BODY_LIMIT));

  if (!report) {
    return interactionJson({ success: false, error: "Invalid request" }, 400);
  }

  const limited = await checkWriteLimit(env.INTERACTION_LIMITER, request);
  if (limited) return limited;

  try {
    const now = Math.floor(Date.now() / 1000);
    const viewer = await readFeedViewer(
      env.DB,
      request.headers.get("cookie"),
      now
    );

    let key = viewer.userId ? userViewerKey(viewer.userId) : null;
    let actorId = viewer.actorId;
    let setCookie: string | undefined;

    if (!key) {
      const actor = await actorForWrite(
        env.DB,
        env.NEW_ACTOR_LIMITER,
        request,
        now
      );

      actorId = actor.id;
      setCookie = actor.setCookie;
      key = actorViewerKey(actor.id);
    }

    if (!key) {
      throw new Error("Unable to resolve viewer key");
    }

    const outcome = await recordSeen(env.DB, {
      key,
      userId: viewer.userId,
      actorId,
      // Ma an danh cu khong con trong DB thi da duoc thay bang ma moi.
      state: viewer.state?.key === key ? viewer.state : null,
      report,
      now
    });

    return interactionJson(
      { success: true, added: outcome.added },
      200,
      setCookie
    );
  } catch (error) {
    if (error instanceof InteractionLimitedError) return tooManyInteractions();

    if (error instanceof ViewerStateBusyError) {
      const response = interactionJson(
        { success: false, error: "Busy" },
        503
      );
      response.headers.set("Retry-After", String(BUSY_RETRY_SECONDS));
      return response;
    }

    console.error("Feed seen error:", error);
    return interactionJson(
      { success: false, error: "Unable to save seen posts" },
      500
    );
  }
};
