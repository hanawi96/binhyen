import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  isMoodFilter,
  isTopicFilter
} from "../../features/content/filter-contents";
import { loadPublicFeed } from "../../features/feed/load-public-feed";
import {
  decodeRankCursor,
  startRankCursor
} from "../../features/feed/rank-feed";

export const prerender = false;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

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

  const cursor =
    rawCursor === null
      ? startRankCursor(topic, mood)
      : decodeRankCursor(rawCursor);

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

  try {
    const page = await loadPublicFeed(env.DB, {
      topic,
      mood,
      cursor: rawCursor,
      limit
    });

    return Response.json(
      {
        success: true,
        items: page.items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        matched: page.matched
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
