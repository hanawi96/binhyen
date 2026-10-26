import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { adminJson, readJsonBody } from "../../../features/admin/admin-http";
import { parseAdminListQuery, parseContentDraft } from "../../../features/admin/content-draft";
import {
  createAdminContent,
  listAdminContents,
  loadAdminCatalog,
  respondAdminError,
  searchAdminContentsLite
} from "../../../features/admin/d1-admin-content";
import { requireAdmin } from "../../../features/admin/require-admin";

export const prerender = false;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export const GET: APIRoute = async ({ request }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);

  // Picker modal: 1 query nhẹ, bỏ count/stats/catalog.
  if (url.searchParams.get("lite") === "1") {
    const q = url.searchParams.get("q") ?? "";
    const rawLimit = Number(url.searchParams.get("limit") ?? "8");
    const limit = Number.isFinite(rawLimit) ? rawLimit : 8;

    try {
      const items = await searchAdminContentsLite(env.DB, q, limit);
      return adminJson({ success: true, items }, 200);
    } catch (error) {
      return respondAdminError(error);
    }
  }

  const query = parseAdminListQuery({
    status: url.searchParams.get("status"),
    q: url.searchParams.get("q"),
    kind: url.searchParams.get("kind"),
    topic: url.searchParams.get("topic"),
    sort: url.searchParams.get("sort"),
    review: url.searchParams.get("review"),
    cursor: url.searchParams.get("cursor"),
    limit: url.searchParams.get("limit")
  });

  if (!query.ok) {
    return adminJson(
      { success: false, error: query.error },
      400
    );
  }

  try {
    const withCatalog = url.searchParams.get("catalog") !== "0";
    const [page, catalog] = await Promise.all([
      listAdminContents(env.DB, query.value),
      withCatalog
        ? loadAdminCatalog(env.DB)
        : Promise.resolve({ topics: [], moods: [] })
    ]);

    return adminJson(
      {
        success: true,
        items: page.items,
        nextCursor: page.nextCursor,
        total: page.total,
        stats: page.stats,
        topics: catalog.topics,
        moods: catalog.moods
      },
      200
    );
  } catch (error) {
    return respondAdminError(error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const draft = parseContentDraft(body.value);

  if (!draft.ok) {
    return adminJson(
      { success: false, error: draft.error },
      400
    );
  }

  try {
    const content = await createAdminContent(
      env.DB,
      draft.value,
      nowSeconds()
    );

    return adminJson({ success: true, content }, 201);
  } catch (error) {
    return respondAdminError(error);
  }
};
