import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { adminJson } from "../../../../features/admin/admin-http";
import { IMPORT_FORMAT_OPTIONS } from "../../../../features/admin/content-import";
import { loadAdminCatalog } from "../../../../features/admin/d1-admin-content";
import { requireAdmin } from "../../../../features/admin/require-admin";

export const prerender = false;

/**
 * GET /api/admin/contents/import-template
 * Tra catalog + nhan dinh dang VI de client tao .xlsx dong bo DB.
 */
export const GET: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const catalog = await loadAdminCatalog(env.DB);

  return adminJson({
    success: true,
    clientTemplate: true,
    formats: IMPORT_FORMAT_OPTIONS.map((item) => item.label),
    topics: catalog.topics,
    moods: catalog.moods
  });
};
