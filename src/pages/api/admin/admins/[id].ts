import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import {
  AdminAccountError,
  parseAdminDisplayName,
  parseAdminPassword,
  updateAdmin,
  type AdminStatus
} from "../../../../features/admin/d1-admin-accounts";
import { adminJson, readJsonBody } from "../../../../features/admin/admin-http";
import { requireAdminSession } from "../../../../features/admin/require-admin";

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const access = await requireAdminSession(request);
  if (!access.ok) return access.response;

  const id = typeof params.id === "string" ? params.id.trim() : "";
  if (!id) {
    return adminJson({ success: false, error: "Thiếu mã admin." }, 400);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const source = body.value as Record<string, unknown>;
  const patch: {
    displayName?: string;
    password?: string;
    status?: AdminStatus;
  } = {};

  if ("displayName" in source) {
    const displayName = parseAdminDisplayName(source.displayName);
    if (!displayName) {
      return adminJson(
        { success: false, error: "Tên hiển thị không hợp lệ." },
        400
      );
    }
    patch.displayName = displayName;
  }

  if ("password" in source) {
    const password = parseAdminPassword(source.password);
    if (!password) {
      return adminJson(
        { success: false, error: "Mật khẩu mới phải từ 12–200 ký tự." },
        400
      );
    }
    patch.password = password;
  }

  if ("status" in source) {
    if (source.status !== "active" && source.status !== "disabled") {
      return adminJson(
        { success: false, error: "Trạng thái không hợp lệ." },
        400
      );
    }
    if (
      source.status === "disabled" &&
      access.admin &&
      access.admin.id === id
    ) {
      return adminJson(
        { success: false, error: "Không thể tự khóa tài khoản đang dùng." },
        409
      );
    }
    patch.status = source.status;
  }

  if (
    patch.displayName === undefined &&
    patch.password === undefined &&
    patch.status === undefined
  ) {
    return adminJson({ success: false, error: "Không có thay đổi." }, 400);
  }

  try {
    const admin = await updateAdmin(env.DB, id, patch);
    return adminJson({ success: true, admin }, 200);
  } catch (error) {
    if (error instanceof AdminAccountError) {
      return adminJson(
        { success: false, error: error.message },
        error.statusCode
      );
    }
    console.error("Update admin error:", error);
    return adminJson({ success: false, error: "Không cập nhật được." }, 500);
  }
};
