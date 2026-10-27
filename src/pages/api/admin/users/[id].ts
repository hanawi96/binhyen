import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import type { UserStatus } from "../../../../features/account/account";
import {
  AdminUserError,
  parseUserDisplayName,
  parseUserPassword,
  updateAdminUser
} from "../../../../features/admin/d1-admin-users";
import { adminJson, readJsonBody } from "../../../../features/admin/admin-http";
import { requireAdmin } from "../../../../features/admin/require-admin";

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const id = typeof params.id === "string" ? params.id.trim() : "";
  if (!id) {
    return adminJson({ success: false, error: "Thiếu mã người dùng." }, 400);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const source = body.value as Record<string, unknown>;
  const patch: {
    displayName?: string;
    password?: string;
    status?: UserStatus;
  } = {};

  if ("displayName" in source) {
    const displayName = parseUserDisplayName(source.displayName);
    if (!displayName) {
      return adminJson(
        { success: false, error: "Tên hiển thị không hợp lệ." },
        400
      );
    }
    patch.displayName = displayName;
  }

  if ("password" in source) {
    const password = parseUserPassword(source.password);
    if (!password) {
      return adminJson(
        { success: false, error: "Mật khẩu mới phải từ 8–200 ký tự." },
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
    const user = await updateAdminUser(env.DB, id, patch);
    return adminJson({ success: true, user }, 200);
  } catch (error) {
    if (error instanceof AdminUserError) {
      return adminJson(
        { success: false, error: error.message },
        error.statusCode
      );
    }
    console.error("Update user error:", error);
    return adminJson({ success: false, error: "Không cập nhật được." }, 500);
  }
};
