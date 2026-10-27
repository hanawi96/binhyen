import { currentUser } from "../account/account";
import { createD1AccountStore } from "../account/d1-account-store";
import {
  actorCookie,
  newActorId,
  readActorId,
  resolveActor
} from "../actor/actor";
import { createD1ActorStore } from "../actor/d1-actor-store";
import { CONTENT_ID_PATTERN } from "../admin/admin-http";
import {
  allowed,
  clientIp,
  guardActorCreation,
  type Limiter
} from "./rate-limit";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

const MAX_BODY_LENGTH = 500;

export function interactionJson(
  body: unknown,
  status = 200,
  setCookie?: string
): Response {
  const response = Response.json(body, { status, headers });
  if (setCookie) response.headers.append("Set-Cookie", setCookie);
  return response;
}

export function validContentId(id: string | undefined): id is string {
  return typeof id === "string" && CONTENT_ID_PATTERN.test(id);
}

/**
 * Chi nhan application/json: trang web khac khong gui duoc
 * kieu nay neu khong qua preflight CORS.
 */
export async function readJsonBody(
  request: Request,
  limit = MAX_BODY_LENGTH
): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return undefined;

  const text = await request.text();
  if (text.length > limit) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const RETRY_AFTER_SECONDS = 10;

export function tooManyInteractions(): Response {
  const response = interactionJson(
    { success: false, error: "Too many requests" },
    429
  );
  response.headers.set("Retry-After", String(RETRY_AFTER_SECONDS));
  return response;
}

/** Khoa dem: ma an danh neu co, khong thi IP. */
export async function checkWriteLimit(
  limiter: Limiter | undefined,
  request: Request
): Promise<Response | null> {
  const actorId = readActorId(request.headers.get("cookie"));
  const key = actorId ? `actor:${actorId}` : `ip:${clientIp(request)}`;

  return (await allowed(limiter, key)) ? null : tooManyInteractions();
}

/**
 * Khi da dang nhap: luon dung ma chinh cua tai khoan (gop ma cookie neu can).
 * Dam bao thich/luu/"Cua toi" dong bo moi thiet bi.
 */
export async function resolveSessionActor(
  db: D1Database,
  request: Request,
  now: number
): Promise<{ id: string; setCookie?: string } | null> {
  const cookieHeader = request.headers.get("cookie");
  const store = createD1AccountStore(db);
  const user = await currentUser(store, cookieHeader, now);
  if (!user) return null;

  const cookieId = readActorId(cookieHeader);
  let primary = await store.primaryActor(user.id);

  if (!primary) {
    if (cookieId && (await store.claimActor(cookieId, user.id, now))) {
      primary = cookieId;
    } else {
      primary = newActorId();
      await store.createActor(primary, user.id, now);
    }
  } else if (cookieId && cookieId !== primary) {
    await store.mergeActor(cookieId, primary, now);
  }

  const secure = new URL(request.url).protocol === "https:";
  return {
    id: primary,
    setCookie:
      cookieId !== primary ? actorCookie(primary, secure) : undefined
  };
}

/** Chi doc ma: session → primary; khong thi cookie (khong tao ma moi). */
export async function actorForRead(
  db: D1Database,
  request: Request,
  now: number
): Promise<{ id: string | null; setCookie?: string }> {
  const session = await resolveSessionActor(db, request, now);
  if (session) return session;
  return { id: readActorId(request.headers.get("cookie")) };
}

/** Nem InteractionLimitedError khi IP tao qua nhieu ma moi. */
export async function actorForWrite(
  db: D1Database,
  newActorLimiter: Limiter | undefined,
  request: Request,
  now: number
): Promise<{ id: string; setCookie?: string }> {
  const session = await resolveSessionActor(db, request, now);
  if (session) return session;

  const ip = clientIp(request);
  const actor = await resolveActor(
    guardActorCreation(createD1ActorStore(db), () =>
      allowed(newActorLimiter, `ip:${ip}`)
    ),
    request.headers.get("cookie"),
    now
  );
  const secure = new URL(request.url).protocol === "https:";

  return {
    id: actor.id,
    setCookie: actor.setCookie ? actorCookie(actor.id, secure) : undefined
  };
}
