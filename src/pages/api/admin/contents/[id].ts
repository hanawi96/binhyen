import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  CONTENT_ID_PATTERN,
  adminJson,
  readJsonBody
} from "../../../../features/admin/admin-http";
import { parseContentDraft } from "../../../../features/admin/content-draft";
import {
  deleteAdminContent,
  getAdminContent,
  peekAdminContent,
  respondAdminError,
  updateAdminContent
} from "../../../../features/admin/d1-admin-content";
import { requireAdmin } from "../../../../features/admin/require-admin";
import {
  gcContentMediaChange,
  listContentMediaRefs
} from "../../../../features/media/media-gc";

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
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const id = contentId(params.id);
  if (id instanceof Response) return id;

  try {
    const peek =
      new URL(request.url).searchParams.get("peek") === "1";

    if (peek) {
      const content = await peekAdminContent(env.DB, id);
      if (!content) {
        return adminJson(
          { success: false, error: "Không tìm thấy bài." },
          404
        );
      }
      return adminJson({ success: true, content }, 200);
    }

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
  const denied = await requireAdmin(request);
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
    const mediaBefore = await listContentMediaRefs(env.DB, id);
    const content = await updateAdminContent(
      env.DB,
      id,
      draft.value,
      nowSeconds()
    );
    const mediaAfter = await listContentMediaRefs(env.DB, id);
    await gcContentMediaChange(env.MEDIA, mediaBefore, mediaAfter);

    return adminJson({ success: true, content }, 200);
  } catch (error) {
    return respondAdminError(error);
  }
};

/** DELETE /api/admin/contents/:id — xoa vinh vien khoi DB (+ media R2 local). */
export const DELETE: APIRoute = async ({ request, params }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const id = contentId(params.id);
  if (id instanceof Response) return id;

  try {
    const mediaBefore = await listContentMediaRefs(env.DB, id);
    const removed = await deleteAdminContent(env.DB, id);

    if (!removed) {
      return adminJson(
        { success: false, error: "Không tìm thấy bài." },
        404
      );
    }

    await gcContentMediaChange(env.MEDIA, mediaBefore, []);

    return adminJson({ success: true, id }, 200);
  } catch (error) {
    return respondAdminError(error);
  }
};
