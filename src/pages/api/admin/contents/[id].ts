import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  CONTENT_ID_PATTERN,
  adminJson,
  readJsonBody
} from "../../../../features/admin/admin-http";
import { parseContentDraft } from "../../../../features/admin/content-draft";
import {
  getAdminContent,
  respondAdminError,
  updateAdminContent
} from "../../../../features/admin/d1-admin-content";
import { requireAdmin } from "../../../../features/admin/require-admin";

export const prerender = false;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function contentId(
  value: string | undefined
): string | Response {
  if (typeof value === "string" && CONTENT_ID_PATTERN.test(value)) {
    return value;
  }

  return adminJson(
    { success: false, error: "Mã bài không hợp lệ." },
    400
  );
}

export const GET: APIRoute = async ({ request, params }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const id = contentId(params.id);
  if (id instanceof Response) return id;

  try {
    const content = await getAdminContent(env.DB, id);

    if (!content) {
      return adminJson(
        { success: false, error: "Không tìm thấy bài." },
        404
      );
    }

    return adminJson({ success: true, content }, 200);
  } catch (error) {
    return respondAdminError(error);
  }
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const id = contentId(params.id);
  if (id instanceof Response) return id;

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
    const content = await updateAdminContent(
      env.DB,
      id,
      draft.value,
      nowSeconds()
    );

    return adminJson({ success: true, content }, 200);
  } catch (error) {
    return respondAdminError(error);
  }
};
