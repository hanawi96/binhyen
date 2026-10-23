import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { CONTENT_ID_PATTERN } from "../../../features/admin/admin-http";
import { loadPublicArticle } from "../../../features/feed/load-public-article";

export const prerender = false;

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

/**
 * GET /api/contents/:id
 * Chỉ một bài đã xuất bản.
 */
export const GET: APIRoute = async ({ params }) => {
  const id = params.id;

  if (typeof id !== "string" || !CONTENT_ID_PATTERN.test(id)) {
    return Response.json(
      { success: false, error: "Invalid id" },
      { status: 400, headers }
    );
  }

  try {
    const article = await loadPublicArticle(env.DB, id);

    if (!article) {
      return Response.json(
        { success: false, error: "Not found" },
        { status: 404, headers }
      );
    }

    return Response.json({ success: true, article }, { headers });
  } catch (error) {
    console.error("Article API error:", error);

    return Response.json(
      { success: false, error: "Unable to load article" },
      { status: 500, headers }
    );
  }
};
