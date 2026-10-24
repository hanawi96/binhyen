import { readCookie } from "../admin/admin-auth";

export const ACTOR_COOKIE = "binhyen_actor";

const ACTOR_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const ACTOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const SEEN_REFRESH_SECONDS = 60 * 60 * 24;

export interface ActorRecord {
  lastSeenAt: number;
}

export interface ActorStore {
  find(id: string): Promise<ActorRecord | null>;
  create(id: string, now: number): Promise<void>;
  touch(id: string, now: number): Promise<void>;
}

export interface ResolvedActor {
  id: string;
  created: boolean;
  setCookie: boolean;
}

export function isActorId(value: string): boolean {
  return ACTOR_ID_PATTERN.test(value);
}

/** 16 byte ngau nhien, ma hoa base64url thanh 22 ky tu. */
export function newActorId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function actorCookie(id: string, secure: boolean): string {
  const parts = [
    `${ACTOR_COOKIE}=${id}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${ACTOR_MAX_AGE_SECONDS}`
  ];

  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readActorId(cookieHeader: string | null): string | null {
  const value = readCookie(cookieHeader, ACTOR_COOKIE);
  return value && isActorId(value) ? value : null;
}

/**
 * Chi goi khi nguoi dung thich, luu hoac chia se.
 * Ma cu hop le thi dung lai; gia han cookie toi da mot lan moi ngay.
 */
export async function resolveActor(
  store: ActorStore,
  cookieHeader: string | null,
  now: number,
  makeId: () => string = newActorId
): Promise<ResolvedActor> {
  const existing = readActorId(cookieHeader);

  if (existing) {
    const record = await store.find(existing);

    if (record) {
      const stale = now - record.lastSeenAt >= SEEN_REFRESH_SECONDS;
      if (stale) await store.touch(existing, now);

      return { id: existing, created: false, setCookie: stale };
    }
  }

  const id = makeId();
  await store.create(id, now);

  return { id, created: true, setCookie: true };
}
