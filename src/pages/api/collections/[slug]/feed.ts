import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { readActorId } from "../../../../features/actor/actor";
import { decodeCollectionCursor } from "../../../../features/collections/collection-cursor";
import { attachViewerReactions } from "../../../../features/feed/feed-rows";
import { loadCollectionFeed } from "../../../../features/feed/load-collection-feed";

export const prerender = false;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** GET /api/collections/:slug/feed */
export const GET: APIRoute = async ({ request, params }) => {
  const slug = params.slug;
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug) || slug.length > 80) {
    return Response.json(
      { success: false, error: "Invalid slug" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const rawCursor = url.searchParams.get("cursor");

  const limit =
    rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return Response.json(
      { success: false, error: "Invalid limit" },
      { status: 400 }
    );
  }

  if (rawCursor !== null && !decodeCollectionCursor(rawCursor)) {
    return Response.json(
      { success: false, error: "Invalid cursor" },
      { status: 400 }
    );
  }

  if (!env.DB) {
    return Response.json(
      { success: false, error: "Database unavailable" },
      { status: 503 }
    );
  }

  try {
    const page = await loadCollectionFeed(env.DB, {
      slug,
      cursor: rawCursor,
      limit
    });

    if (!page) {
      return Response.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    const actorId = readActorId(request.headers.get("cookie"));
    const items = await attachViewerReactions(env.DB, page.items, actorId);

    return Response.json({
      success: true,
      collection: page.collection,
      items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      matched: page.matched
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid collection cursor") {
      return Response.json(
        { success: false, error: "Invalid cursor" },
        { status: 400 }
      );
    }
    console.error("collection feed error:", error);
    return Response.json(
      { success: false, error: "Unable to load feed" },
      { status: 500 }
    );
  }
};
