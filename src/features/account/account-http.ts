import { actorCookie, readActorId } from "../actor/actor";
import { interactionJson } from "../interactions/interaction-http";
import { allowed, clientIp, type Limiter } from "../interactions/rate-limit";
import { sessionCookie, type SignedIn } from "./account";

export function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

export function cookieActor(request: Request): string | null {
  return readActorId(request.headers.get("cookie"));
}

/** Chong do mat khau: dem theo IP, dung chung cho dang ky va dang nhap. */
export async function authLimited(
  limiter: Limiter | undefined,
  request: Request
): Promise<Response | null> {
  if (await allowed(limiter, `auth:${clientIp(request)}`)) return null;

  const response = interactionJson(
    { success: false, error: "Too many attempts" },
    429
  );
  response.headers.set("Retry-After", "60");
  return response;
}

export function signedInResponse(
  request: Request,
  result: SignedIn,
  status: number
): Response {
  const secure = isSecure(request);
  const response = interactionJson(
    { success: true, user: result.user },
    status
  );

  response.headers.append("Set-Cookie", sessionCookie(result.token, secure));
  response.headers.append("Set-Cookie", actorCookie(result.actorId, secure));
  return response;
}
