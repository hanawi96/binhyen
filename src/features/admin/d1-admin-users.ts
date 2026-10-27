import type { UserStatus } from "../account/account";
import { hashPassword } from "../account/password";
import { cleanDisplayName } from "../account/profile";
import { likeContains } from "./content-draft";

export interface AdminUserListItem {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AdminUserListQuery {
  q: string;
  status: "all" | UserStatus;
  cursor: { at: number; id: string } | null;
  limit: number;
}

export class AdminUserError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? count : 0;
}

function mapStatus(value: string): UserStatus | null {
  return value === "active" || value === "disabled" ? value : null;
}

export function encodeUserCursor(at: number, id: string): string {
  return `c.${at}.${id}`;
}

export function decodeUserCursor(
  value: string | null
): { at: number; id: string } | null {
  if (!value) return null;
  const match = /^c\.(\d{1,12})\.([A-Za-z0-9_-]{1,80})$/.exec(value);
  if (!match) return null;
  return { at: Number(match[1]), id: match[2] ?? "" };
}

export function parseUserListQuery(params: {
  q: string | null;
  status: string | null;
  cursor: string | null;
  limit: string | null;
}):
  | { ok: true; value: AdminUserListQuery }
  | { ok: false; error: string } {
  const q = (params.q ?? "").trim();
  if (q.length > 80) return { ok: false, error: "Từ tìm kiếm quá dài." };

  const statusRaw = params.status ?? "all";
  if (
    statusRaw !== "all" &&
    statusRaw !== "active" &&
    statusRaw !== "disabled"
  ) {
    return { ok: false, error: "Bộ lọc trạng thái không hợp lệ." };
  }

  const cursor = decodeUserCursor(params.cursor);
  if (params.cursor && !cursor) {
    return { ok: false, error: "Trang tiếp theo không hợp lệ." };
  }

  let limit = 12;
  if (params.limit) {
    if (!/^\d{1,2}$/.test(params.limit)) {
      return { ok: false, error: "Số dòng mỗi trang không hợp lệ." };
    }
    limit = Number(params.limit);
    if (limit < 1 || limit > 20) {
      return { ok: false, error: "Số dòng mỗi trang không hợp lệ." };
    }
  }

  return {
    ok: true,
    value: {
      q,
      status: statusRaw,
      cursor,
      limit
    }
  };
}

export async function listAdminUsers(
  db: D1Database,
  query: AdminUserListQuery,
  options: { includeTotal?: boolean } = {}
): Promise<{
  items: AdminUserListItem[];
  nextCursor: string | null;
  total: number | null;
}> {
  const includeTotal = options.includeTotal ?? true;
  const cursorAt = query.cursor?.at ?? -1;
  const cursorId = query.cursor?.id ?? "";
  const like = query.q ? likeContains(query.q) : "";

  const filter = `WHERE (?1 = 'all' OR u.status = ?1)
    AND (
      ?2 = ''
      OR u.email LIKE ?3 ESCAPE '\\'
      OR u.display_name LIKE ?3 ESCAPE '\\'
    )
    AND (
      ?4 < 0
      OR u.created_at < ?4
      OR (u.created_at = ?4 AND u.id < ?5)
    )`;

  const bindings: Array<string | number> = [
    query.status,
    query.q,
    like,
    cursorAt,
    cursorId
  ];

  const pagePromise = db
    .prepare(
      `SELECT u.id, u.email, u.display_name, u.status,
              u.created_at, u.updated_at
       FROM users u
       ${filter}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT ?6`
    )
    .bind(...bindings, query.limit + 1)
    .all<{
      id: string;
      email: string;
      display_name: string;
      status: string;
      created_at: number;
      updated_at: number;
    }>();

  const totalPromise = includeTotal
    ? db
        .prepare(
          `SELECT COUNT(*) AS n
           FROM users u
           WHERE (?1 = 'all' OR u.status = ?1)
             AND (
               ?2 = ''
               OR u.email LIKE ?3 ESCAPE '\\'
               OR u.display_name LIKE ?3 ESCAPE '\\'
             )`
        )
        .bind(query.status, query.q, like)
        .first<{ n: number }>()
    : Promise.resolve(null);

  const [page, totalRow] = await Promise.all([pagePromise, totalPromise]);
  const rows = page.results ?? [];
  const visible = rows.slice(0, query.limit);
  const items: AdminUserListItem[] = [];

  for (const row of visible) {
    const status = mapStatus(row.status);
    if (!status) continue;
    items.push({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  const last = visible.at(-1);
  const nextCursor =
    rows.length > query.limit && last
      ? encodeUserCursor(last.created_at, last.id)
      : null;

  return {
    items,
    nextCursor,
    total: includeTotal ? asCount(totalRow?.n) : null
  };
}

export async function updateAdminUser(
  db: D1Database,
  id: string,
  patch: {
    displayName?: string;
    status?: UserStatus;
    password?: string;
  },
  now = nowSeconds()
): Promise<AdminUserListItem> {
  const current = await db
    .prepare(
      `SELECT id, email, display_name, status, created_at, updated_at,
              password_hash
       FROM users
       WHERE id = ?1`
    )
    .bind(id)
    .first<{
      id: string;
      email: string;
      display_name: string;
      status: string;
      created_at: number;
      updated_at: number;
      password_hash: string;
    }>();

  if (!current) throw new AdminUserError(404, "Không tìm thấy người dùng.");

  const status = mapStatus(current.status) ?? "active";
  const displayName = patch.displayName ?? current.display_name;
  const nextStatus = patch.status ?? status;
  const passwordHash = patch.password
    ? await hashPassword(patch.password)
    : current.password_hash;

  await db
    .prepare(
      `UPDATE users
       SET display_name = ?2,
           status = ?3,
           password_hash = ?4,
           updated_at = ?5
       WHERE id = ?1`
    )
    .bind(id, displayName, nextStatus, passwordHash, now)
    .run();

  if (patch.password || patch.status === "disabled") {
    await db
      .prepare(`DELETE FROM user_sessions WHERE user_id = ?1`)
      .bind(id)
      .run();
  }

  return {
    id: current.id,
    email: current.email,
    displayName,
    status: nextStatus,
    createdAt: current.created_at,
    updatedAt: now
  };
}

export function parseUserDisplayName(value: unknown): string | null {
  return cleanDisplayName(value);
}

export function parseUserPassword(value: unknown): string | null {
  return typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 200
    ? value
    : null;
}
