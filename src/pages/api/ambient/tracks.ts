import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { listAmbientTracks } from "../../../features/ambient/d1-ambient-tracks";

export const prerender = false;

/**
 * GET /api/ambient/tracks — danh sach cong khai cho player.
 */
export const GET: APIRoute = async () => {
  if (!env.DB) {
    return Response.json(
      { success: false, error: "Database unavailable", tracks: [], defaultId: null },
      { status: 503 }
    );
  }

  try {
    const rows = await listAmbientTracks(env.DB);
    const defaultId =
      rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? null;

    return Response.json(
      {
        success: true,
        defaultId,
        tracks: rows.map((row) => ({
          id: row.id,
          title: row.title,
          src: row.url
        }))
      },
      {
        headers: {
          "cache-control": "public, max-age=30"
        }
      }
    );
  } catch (error) {
    console.error("ambient tracks list error:", error);
    return Response.json(
      { success: false, error: "Không tải được danh sách nhạc.", tracks: [], defaultId: null },
      { status: 500 }
    );
  }
};
