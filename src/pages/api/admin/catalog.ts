import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  parseCatalogCreate,
  parseCatalogUpdate
} from "../../../features/admin/catalog";
import {
  createCatalogEntry,
  updateCatalogEntry
} from "../../../features/admin/d1-catalog";
import { adminJson, readJsonBody } from "../../../features/admin/admin-http";
import { requireAdmin } from "../../../features/admin/require-admin";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const body = await readJsonBody(request, 1000);
  if (!body.ok) return body.response;

  const parsed = parseCatalogCreate(body.value);
  if (!parsed.ok) {
    return adminJson({ success: false, error: parsed.error }, 400);
  }

  const created = await createCatalogEntry(
    env.DB,
    parsed.value.kind,
    parsed.value.slug,
    parsed.value.label
  );

  if (!created.ok) {
    return adminJson(
      {
        success: false,
        error: created.conflict
          ? "Mã đã tồn tại. Đổi tên một chút rồi thử lại."
          : "Không tạo được mục."
      },
      created.conflict ? 409 : 500
    );
  }

  return adminJson({ success: true, item: created.item }, 201);
};

export const PATCH: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const body = await readJsonBody(request, 1000);
  if (!body.ok) return body.response;

  const parsed = parseCatalogUpdate(body.value);
  if (!parsed.ok) {
    return adminJson({ success: false, error: parsed.error }, 400);
  }

  const item = await updateCatalogEntry(
    env.DB,
    parsed.value.kind,
    parsed.value.slug,
    parsed.value.label,
    parsed.value.sortOrder
  );

  if (!item) {
    return adminJson(
      { success: false, error: "Không thấy mục này." },
      404
    );
  }

  return adminJson({ success: true, item }, 200);
};
