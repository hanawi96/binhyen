import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { adminJson, readJsonBody } from "../../../../features/admin/admin-http";
import {
  draftFromImportRow,
  IMPORT_MAX_ROWS,
  type ImportRowResult
} from "../../../../features/admin/content-import";
import {
  createAdminContent,
  loadAdminCatalog,
  AdminContentError
} from "../../../../features/admin/d1-admin-content";
import { requireAdmin } from "../../../../features/admin/require-admin";

export const prerender = false;

/**
 * POST /api/admin/contents/import
 * Body: { rows: Array<Record<string, string>> }
 * Moi dong hop le → status draft.
 */
export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  // File Excel co the goi nhieu dong — nới limit JSON.
  const body = await readJsonBody(request, 500_000);
  if (!body.ok) return body.response;

  const source = body.value as Record<string, unknown>;
  if (!Array.isArray(source.rows)) {
    return adminJson(
      { success: false, error: "Thiếu danh sách rows." },
      400
    );
  }

  if (source.rows.length === 0) {
    return adminJson(
      { success: false, error: "File không có dòng dữ liệu." },
      400
    );
  }

  if (source.rows.length > IMPORT_MAX_ROWS) {
    return adminJson(
      {
        success: false,
        error: `Tối đa ${IMPORT_MAX_ROWS} dòng / lần.`
      },
      400
    );
  }

  const catalog = await loadAdminCatalog(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const results: ImportRowResult[] = [];
  let created = 0;
  let failed = 0;

  for (let index = 0; index < source.rows.length; index += 1) {
    const rowNumber =
      typeof (source.rows[index] as { __row?: number })?.__row === "number"
        ? (source.rows[index] as { __row: number }).__row
        : index + 2;

    const raw = source.rows[index];
    if (!raw || typeof raw !== "object") {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        error: "Dòng không đọc được."
      });
      continue;
    }

    const record = raw as Record<string, unknown>;
    const parsed = draftFromImportRow(record, catalog);

    if (!parsed.ok) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        title:
          typeof record.title === "string" ? record.title : undefined,
        error: parsed.error
      });
      continue;
    }

    try {
      const content = await createAdminContent(
        env.DB,
        parsed.value,
        now + index
      );
      created += 1;
      results.push({
        row: rowNumber,
        ok: true,
        id: content.id,
        title: content.title
      });
    } catch (error) {
      failed += 1;
      results.push({
        row: rowNumber,
        ok: false,
        title: parsed.value.title,
        error:
          error instanceof AdminContentError
            ? error.message
            : "Không tạo được bài."
      });
    }
  }

  return adminJson(
    {
      success: true,
      created,
      failed,
      maxRows: IMPORT_MAX_ROWS,
      results
    },
    200
  );
};
