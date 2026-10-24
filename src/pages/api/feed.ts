import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  isMoodFilter,
  isTopicFilter
} from "../../features/content/filter-contents";
import {
  readFeedViewer,
  resetViewerLoop
} from "../../features/feed/d1-viewer-state";
import { attachViewerReactions } from "../../features/feed/feed-rows";
import { loadLovedFeed } from "../../features/feed/load-loved-feed";
import { loadPublicFeed } from "../../features/feed/load-public-feed";
import { decodeLovedCursor } from "../../features/feed/loved-cursor";
import {
  decodeRingCursor,
  type RingCursor
} from "../../features/feed/ring-feed";

export const prerender = false;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
/** Cursor truoc v6 (sap theo ngay dang): mo lai bo loc tu dau thay vi bao loi. */
const LEGACY_CURSOR = /^v[1-5]:/;

function readFilter<T extends string>(
  value: string | null,
  accept: (value: string) => value is T | "all"
): T | "all" | null {
  if (value === null || value === "all") return "all";

  return accept(value) ? value : null;
}

/**
 * GET /api/feed
 *
 * Moi nhom lay toi da mot trang, roi tron o server.
 * Khong keo ca bang ve Worker.
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);

  const rawLimit = url.searchParams.get("limit");
  const rawCursor = url.searchParams.get("cursor");
  const topic = readFilter(
    url.searchParams.get("topic"),
    isTopicFilter
  );
  const mood = readFilter(
    url.searchParams.get("mood"),
    isMoodFilter
  );

  const limit =
    rawLimit === null
      ? DEFAULT_LIMIT
      : Number(rawLimit);

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    return Response.json(
      {
        success: false,
        error: "Invalid limit"
      },
      { status: 400 }
    );
  }

  const section = url.searchParams.get("section");

  if (section !== null && section !== "loved") {
    return Response.json(
      {
        success: false,
        error: "Invalid section"
      },
      { status: 400 }
    );
  }

  if (section === "loved") {
    if (rawCursor !== null && !decodeLovedCursor(rawCursor)) {
      return Response.json(
        {
          success: false,
          error: "Invalid cursor"
        },
        { status: 400 }
      );
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const viewer = await readFeedViewer(
        env.DB,
        request.headers.get("cookie"),
        now
      );
      const page = await loadLovedFeed(env.DB, {
        cursor: rawCursor,
        limit
      });
      const items = await attachViewerReactions(
        env.DB,
        page.items,
        viewer.actorId
      );

      return Response.json(
        { success: true, ...page, items },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
          }
        }
      );
    } catch (error) {
      console.error("Loved feed API error:", error);

      return Response.json(
        {
          success: false,
          error: "Unable to load content"
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }
  }

  if (topic === null) {
    return Response.json(
      {
        success: false,
        error: "Invalid topic"
      },
      { status: 400 }
    );
  }

  if (mood === null) {
    return Response.json(
      {
        success: false,
        error: "Invalid mood"
      },
      { status: 400 }
    );
  }

  let cursor: RingCursor | null = null;

  if (rawCursor !== null && !LEGACY_CURSOR.test(rawCursor)) {
    cursor = decodeRingCursor(rawCursor);

    if (
      !cursor ||
      cursor.topic !== topic ||
      cursor.mood !== mood
    ) {
      return Response.json(
        {
          success: false,
          error: "Invalid cursor"
        },
        { status: 400 }
      );
    }
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const viewer = await readFeedViewer(
      env.DB,
      request.headers.get("cookie"),
      now
    );
    const page = await loadPublicFeed(env.DB, {
      topic,
      mood,
      cursor,
      limit,
      viewer,
      onAllSeen: () => resetViewerLoop(env.DB, viewer, now)
    });

    return Response.json(
      {
        success: true,
        items: page.items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        matched: page.matched,
        notice: page.notice,
        pageCursor: page.pageCursor
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch (error) {
    console.error("Feed API error:", error);

    return Response.json(
      {
        success: false,
        error: "Unable to load content"
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
};
