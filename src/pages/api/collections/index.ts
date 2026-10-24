import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { listCollectionsPublic } from "../../../features/collections/d1-collections";

export const prerender = false;

/** GET /api/collections — danh sach bo published. */
export const GET: APIRoute = async () => {
  if (!env.DB) {
    return Response.json(
      { success: false, error: "Database unavailable" },
      { status: 503 }
    );
  }

  try {
    const collections = await listCollectionsPublic(env.DB);
    return Response.json({
      success: true,
      collections: collections.map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        description: item.description,
        itemCount: item.itemCount,
        sortOrder: item.sortOrder
      }))
    });
  } catch (error) {
    console.error("collections list error:", error);
    return Response.json(
      { success: false, error: "Unable to load collections" },
      { status: 500 }
    );
  }
};
