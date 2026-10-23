
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async () => {
  // API kiem tra chi duoc su dung khi phat trien.
  if (!import.meta.env.DEV) {
    return new Response("Not Found", {
      status: 404
    });
  }

  try {
    const result = await env.DB
      .prepare("SELECT 1 AS ok")
      .first<{ ok: number }>();

    if (result?.ok !== 1) {
      throw new Error("Unexpected D1 response");
    }

    return Response.json(
      {
        success: true,
        database: "D1 Local",
        connection: "healthy"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("D1 connection check failed:", error);

    return Response.json(
      {
        success: false,
        message: "Database connection failed"
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
};
