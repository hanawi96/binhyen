import { hashSessionToken, newSessionToken } from "../account/account";
import { hashPassword, verifyPassword } from "../account/password";
import {
  hashAdminPassword,
  passwordMatches,
  secretsMatch
} from "./admin-auth";

export type AdminStatus = "active" | "disabled";

export interface PublicAdmin {
  id: string;
  username: string;
  displayName: string;
  status: AdminStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AdminRecord extends PublicAdmin {
  passwordHash: string;
}

const SESSION_DAYS = 14;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function newAdminId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `adm_${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

function mapAdmin(row: {
  id: string;
  username: string;
  display_name: string;
  password_hash?: string;
  status: string;
  created_at: number;
  updated_at: number;
}): AdminRecord | null {
  if (row.status !== "active" && row.status !== "disabled") return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash ?? "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toPublicAdmin(admin: AdminRecord): PublicAdmin {
  return {
    id: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    status: admin.status,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt
  };
}

export function parseAdminUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim();
  return USERNAME_RE.test(username) ? username : null;
}

export function parseAdminDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 60 ? name : null;
}

export function parseAdminPassword(value: unknown): string | null {
  return typeof value === "string" &&
    value.length >= 12 &&
    value.length <= 200
    ? value
    : null;
}

export async function countAdmins(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM admins`)
    .first<{ n: number }>();
  return typeof row?.n === "number" ? row.n : Number(row?.n) || 0;
}

export async function listAdmins(db: D1Database): Promise<PublicAdmin[]> {
  const rows = await db
    .prepare(
      `SELECT id, username, display_name, status, created_at, updated_at
       FROM admins
       ORDER BY created_at ASC, username ASC`
    )
    .all<{
      id: string;
      username: string;
      display_name: string;
      status: string;
      created_at: number;
      updated_at: number;
    }>();

  return (rows.results ?? [])
    .map((row) => mapAdmin(row))
    .filter((row): row is AdminRecord => Boolean(row))
    .map(toPublicAdmin);
}

export async function findAdminByUsername(
  db: D1Database,
  username: string
): Promise<AdminRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, username, display_name, password_hash, status,
              created_at, updated_at
       FROM admins
       WHERE username = ?1`
    )
    .bind(username)
    .first<{
      id: string;
      username: string;
      display_name: string;
      password_hash: string;
      status: string;
      created_at: number;
      updated_at: number;
    }>();

  return row ? mapAdmin(row) : null;
}

export async function findAdminById(
  db: D1Database,
  id: string
): Promise<AdminRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, username, display_name, password_hash, status,
              created_at, updated_at
       FROM admins
       WHERE id = ?1`
    )
    .bind(id)
    .first<{
      id: string;
      username: string;
      display_name: string;
      password_hash: string;
      status: string;
      created_at: number;
      updated_at: number;
    }>();

  return row ? mapAdmin(row) : null;
}

export async function createAdmin(
  db: D1Database,
  input: {
    username: string;
    displayName: string;
    password: string;
  },
  now = nowSeconds()
): Promise<PublicAdmin> {
  const id = newAdminId();
  const passwordHash = await hashPassword(input.password);

  try {
    await db
      .prepare(
        `INSERT INTO admins (
           id, username, display_name, password_hash, status,
           created_at, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)`
      )
      .bind(id, input.username, input.displayName, passwordHash, now)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE|constraint/i.test(message)) {
      throw new AdminAccountError(409, "Tên đăng nhập đã được dùng.");
    }
    throw error;
  }

  const saved = await findAdminById(db, id);
  if (!saved) throw new AdminAccountError(500, "Không tạo được tài khoản.");
  return toPublicAdmin(saved);
}

export async function updateAdmin(
  db: D1Database,
  id: string,
  patch: {
    displayName?: string;
    password?: string;
    status?: AdminStatus;
  },
  now = nowSeconds()
): Promise<PublicAdmin> {
  const current = await findAdminById(db, id);
  if (!current) throw new AdminAccountError(404, "Không tìm thấy admin.");

  if (patch.status === "disabled" && current.status === "active") {
    const active = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM admins WHERE status = 'active'`
      )
      .first<{ n: number }>();
    if ((active?.n ?? 0) <= 1) {
      throw new AdminAccountError(
        409,
        "Không thể khóa admin cuối cùng đang hoạt động."
      );
    }
  }

  const displayName = patch.displayName ?? current.displayName;
  const status = patch.status ?? current.status;
  const passwordHash = patch.password
    ? await hashPassword(patch.password)
    : current.passwordHash;

  await db
    .prepare(
      `UPDATE admins
       SET display_name = ?2,
           password_hash = ?3,
           status = ?4,
           updated_at = ?5
       WHERE id = ?1`
    )
    .bind(id, displayName, passwordHash, status, now)
    .run();

  if (patch.password || patch.status === "disabled") {
    await db
      .prepare(`DELETE FROM admin_sessions WHERE admin_id = ?1`)
      .bind(id)
      .run();
  }

  const saved = await findAdminById(db, id);
  if (!saved) throw new AdminAccountError(500, "Không cập nhật được.");
  return toPublicAdmin(saved);
}

export async function createAdminSession(
  db: D1Database,
  adminId: string,
  now = nowSeconds()
): Promise<string> {
  const token = newSessionToken();
  const tokenHash = await hashSessionToken(token);
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60;

  await db.batch([
    db
      .prepare(
        `DELETE FROM admin_sessions
         WHERE admin_id = ?1 AND expires_at <= ?2`
      )
      .bind(adminId, now),
    db
      .prepare(
        `INSERT INTO admin_sessions
           (token_hash, admin_id, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4)`
      )
      .bind(tokenHash, adminId, now, expiresAt)
  ]);

  return token;
}

export async function findSessionAdmin(
  db: D1Database,
  rawToken: string,
  now = nowSeconds()
): Promise<PublicAdmin | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = await hashSessionToken(rawToken);
  const row = await db
    .prepare(
      `SELECT a.id, a.username, a.display_name, a.status,
              a.created_at, a.updated_at
       FROM admin_sessions s
       JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ?1
         AND s.expires_at > ?2
         AND a.status = 'active'`
    )
    .bind(tokenHash, now)
    .first<{
      id: string;
      username: string;
      display_name: string;
      status: string;
      created_at: number;
      updated_at: number;
    }>();

  const admin = row ? mapAdmin(row) : null;
  return admin ? toPublicAdmin(admin) : null;
}

export async function deleteAdminSession(
  db: D1Database,
  rawToken: string
): Promise<void> {
  if (!rawToken) return;
  const tokenHash = await hashSessionToken(rawToken);
  await db
    .prepare(`DELETE FROM admin_sessions WHERE token_hash = ?1`)
    .bind(tokenHash)
    .run();
}

/**
 * Dang nhap: uu tien DB; neu chua co admin nao thi bootstrap tu env + mat khau vua nhap.
 */
export async function loginAdmin(
  db: D1Database,
  input: { username: string; password: string },
  envAccount: {
    username: string | undefined;
    salt: string | undefined;
    hash: string | undefined;
  }
): Promise<{ ok: true; token: string; admin: PublicAdmin } | { ok: false }> {
  const existing = await findAdminByUsername(db, input.username);

  if (existing) {
    if (existing.status !== "active") return { ok: false };
    const ok = await verifyPassword(input.password, existing.passwordHash);
    if (!ok) return { ok: false };
    const token = await createAdminSession(db, existing.id);
    return { ok: true, token, admin: toPublicAdmin(existing) };
  }

  const total = await countAdmins(db);
  if (total > 0) return { ok: false };

  const usernameOk =
    Boolean(envAccount.username) &&
    secretsMatch(input.username, envAccount.username, 3);
  const passwordOk = await passwordMatches(
    input.password,
    envAccount.salt,
    envAccount.hash
  );

  if (!usernameOk || !passwordOk || !envAccount.username) {
    return { ok: false };
  }

  // Bootstrap: tao admin dau tien tu env (hash PBKDF2 moi).
  const created = await createAdmin(db, {
    username: envAccount.username,
    displayName: envAccount.username,
    password: input.password
  });
  const token = await createAdminSession(db, created.id);
  return { ok: true, token, admin: created };
}

/** Chi dung khi can doi hash cu SHA256+salt — giu de test/bootstrap. */
export async function legacyEnvPasswordHash(
  password: string,
  salt: string
): Promise<string> {
  return hashAdminPassword(password, salt);
}

export class AdminAccountError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}
