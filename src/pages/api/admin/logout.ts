import type { APIRoute } from "astro";

import { clearAdminSessionCookie } from "../../../features/admin/admin-auth";
import { adminJson } from "../../../features/admin/admin-http";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const response = adminJson({ success: true }, 200);
  response.headers.append(
    "Set-Cookie",
    clearAdminSessionCookie(
      new URL(request.url).protocol === "https:"
    )
  );
  return response;
};
