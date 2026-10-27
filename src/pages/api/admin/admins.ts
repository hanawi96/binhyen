import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  AdminAccountError,
  createAdmin,
  listAdmins,
  parseAdminDisplayName,
  parseAdminPassword,
  parseAdminUsername
} from "../../../features/admin/d1-admin-accounts";
import { adminJson, readJsonBody } from "../../../features/admin/admin-http";
import { requireAdmin } from "../../../features/admin/require-admin";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const items = await listAdmins(env.DB);
    return adminJson({ success: true, items }, 200);
  } catch (error) {
    console.error("List admins error:", error);
    return adminJson({ success: false, error: "Không tải được danh sách." }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const source = body.value as Record<string, unknown>;
  const username = parseAdminUsername(source.username);
  const displayName =
    parseAdminDisplayName(source.displayName) ??
    (username ? username : null);
  const password = parseAdminPassword(source.password);

  if (!username || !displayName || !password) {
    return adminJson(
      {
        success: false,
        error:
          "Tên đăng nhập (3–40), tên hiển thị và mật khẩu (≥12 ký tự) là bắt buộc."
      },
      400
    );
  }

  try {
    const admin = await createAdmin(env.DB, {
      username,
      displayName,
      password
    });
    return adminJson({ success: true, admin }, 201);
  } catch (error) {
    if (error instanceof AdminAccountError) {
      return adminJson(
        { success: false, error: error.message },
        error.statusCode
      );
    }
    console.error("Create admin error:", error);
    return adminJson({ success: false, error: "Không tạo được admin." }, 500);
  }
};
