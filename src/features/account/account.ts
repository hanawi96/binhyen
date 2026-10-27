import { readCookie } from "../admin/admin-auth";
import { ACTOR_COOKIE, newActorId } from "../actor/actor";
import { hashPassword, verifyDecoy, verifyPassword } from "./password";
import { cleanDisplayName } from "./profile";

export const SESSION_COOKIE = "binhyen_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

export type UserStatus = "active" | "disabled";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}

export interface UserRecord extends PublicUser {
  passwordHash: string;
  status: UserStatus;
}

export interface AccountStore {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  /** false khi email da co nguoi dung. */
  createUser(user: UserRecord, now: number): Promise<boolean>;
  createSession(
    tokenHash: string,
    userId: string,
    now: number,
    expiresAt: number
  ): Promise<void>;
  findSessionUser(tokenHash: string, now: number): Promise<PublicUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
  primaryActor(userId: string): Promise<string | null>;
  /** Gan ma an danh chua thuoc ai cho tai khoan. */
  claimActor(actorId: string, userId: string, now: number): Promise<boolean>;
  createActor(actorId: string, userId: string, now: number): Promise<void>;
  /** Chuyen thich / luu / chia se tu ma an danh sang ma cua tai khoan. */
  mergeActor(fromId: string, intoId: string, now: number): Promise<void>;
}

export interface SignedIn {
  user: PublicUser;
  actorId: string;
  token: string;
}

export type RegisterResult =
  | ({ ok: true } & SignedIn)
  | { ok: false; reason: "invalid" | "taken" };

export type LoginResult =
  | ({ ok: true } & SignedIn)
  | { ok: false; reason: "invalid" | "wrong" };

function field(input: unknown, key: string): unknown {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)[key]
    : undefined;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

function readPassword(value: unknown): string | null {
  return typeof value === "string" &&
    value.length >= MIN_PASSWORD &&
    value.length <= MAX_PASSWORD
    ? value
    : null;
}

function readDisplayName(value: unknown, email: string): string | null {
  if (value === undefined || value === null || value === "") {
    return email.split("@")[0]?.slice(0, 60) || "Bạn";
  }
  return cleanDisplayName(value);
}

export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function readSessionToken(cookieHeader: string | null): string | null {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  const parts = [
    `${name}=${value}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];

  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookie(token: string, secure: boolean): string {
  return cookie(SESSION_COOKIE, token, SESSION_MAX_AGE_SECONDS, secure);
}

/** Dang xuat xoa ca ma an danh de may dung chung khong giu luot thich. */
export function signOutCookies(secure: boolean): string[] {
  return [
    cookie(SESSION_COOKIE, "", 0, secure),
    cookie(ACTOR_COOKIE, "", 0, secure)
  ];
}

async function attachActor(
  store: AccountStore,
  userId: string,
  cookieActorId: string | null,
  now: number,
  makeId: () => string
): Promise<string> {
  const primary = await store.primaryActor(userId);

  if (!primary) {
    if (cookieActorId && (await store.claimActor(cookieActorId, userId, now))) {
      return cookieActorId;
    }

    const id = makeId();
    await store.createActor(id, userId, now);
    return id;
  }

  if (cookieActorId && cookieActorId !== primary) {
    await store.mergeActor(cookieActorId, primary, now);
  }

  return primary;
}

async function startSession(
  store: AccountStore,
  user: PublicUser,
  cookieActorId: string | null,
  now: number,
  makeId: () => string
): Promise<SignedIn> {
  const actorId = await attachActor(store, user.id, cookieActorId, now, makeId);
  const token = newSessionToken();

  await store.createSession(
    await hashSessionToken(token),
    user.id,
    now,
    now + SESSION_MAX_AGE_SECONDS
  );

  return { user, actorId, token };
}

export async function register(
  store: AccountStore,
  input: unknown,
  cookieActorId: string | null,
  now: number,
  makeId: () => string = newActorId
): Promise<RegisterResult> {
  const email = normalizeEmail(field(input, "email"));
  const password = readPassword(field(input, "password"));
  const displayName = email
    ? readDisplayName(field(input, "displayName"), email)
    : null;

  if (!email || !password || !displayName) {
    return { ok: false, reason: "invalid" };
  }

  const user: PublicUser = { id: crypto.randomUUID(), email, displayName };
  const created = await store.createUser(
    {
      ...user,
      passwordHash: await hashPassword(password),
      status: "active"
    },
    now
  );

  if (!created) return { ok: false, reason: "taken" };

  return {
    ok: true,
    ...(await startSession(store, user, cookieActorId, now, makeId))
  };
}

export async function login(
  store: AccountStore,
  input: unknown,
  cookieActorId: string | null,
  now: number,
  makeId: () => string = newActorId
): Promise<LoginResult> {
  const email = normalizeEmail(field(input, "email"));
  const password = readPassword(field(input, "password"));

  if (!email || !password) return { ok: false, reason: "invalid" };

  const record = await store.findUserByEmail(email);
  const matches = record
    ? await verifyPassword(password, record.passwordHash)
    : await verifyDecoy(password);

  if (!record || !matches) return { ok: false, reason: "wrong" };
  if (record.status === "disabled") return { ok: false, reason: "wrong" };

  const user: PublicUser = {
    id: record.id,
    email: record.email,
    displayName: record.displayName
  };

  return {
    ok: true,
    ...(await startSession(store, user, cookieActorId, now, makeId))
  };
}

export async function currentUser(
  store: AccountStore,
  cookieHeader: string | null,
  now: number
): Promise<PublicUser | null> {
  const token = readSessionToken(cookieHeader);
  if (!token) return null;

  return store.findSessionUser(await hashSessionToken(token), now);
}

export async function logout(
  store: AccountStore,
  cookieHeader: string | null
): Promise<void> {
  const token = readSessionToken(cookieHeader);
  if (token) await store.deleteSession(await hashSessionToken(token));
}
