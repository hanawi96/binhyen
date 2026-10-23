export const ADMIN_COOKIE = "binhyen_admin";

export function readCookie(
  header: string | null,
  name: string
): string | null {
  if (!header) return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim();
    if (key !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function hasAdminSession(
  cookieHeader: string | null,
  expected: string | undefined
): boolean {
  return tokensMatch(
    readCookie(cookieHeader, ADMIN_COOKIE) ?? "",
    expected
  );
}

export function adminSessionCookie(
  token: string,
  secure: boolean
): string {
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict"
  ];

  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearAdminSessionCookie(secure: boolean): string {
  const parts = [
    `${ADMIN_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    "Max-Age=0"
  ];

  if (secure) parts.push("Secure");
  return parts.join("; ");
}

const MIN_TOKEN_LENGTH = 16;
const MIN_PASSWORD_LENGTH = 12;

export function readBearerToken(
  header: string | null
): string | null {
  if (!header) return null;

  const match = /^Bearer ([A-Za-z0-9_-]{16,200})$/.exec(
    header
  );

  return match?.[1] ?? null;
}

/**
 * So sanh chuoi bi mat ma khong dung som khi khac nhau.
 * Chuoi rong hoac qua ngan luon bi tu choi.
 */
export function secretsMatch(
  presented: string,
  expected: string | undefined,
  minLength: number
): boolean {
  if (
    !expected ||
    expected.length < minLength ||
    presented.length < minLength
  ) {
    return false;
  }

  const encoder = new TextEncoder();
  const left = encoder.encode(presented);
  const right = encoder.encode(expected);
  const length = Math.max(left.length, right.length);
  let difference = left.length === right.length ? 0 : 1;

  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

export function tokensMatch(
  presented: string,
  expected: string | undefined
): boolean {
  return secretsMatch(presented, expected, MIN_TOKEN_LENGTH);
}

export async function hashAdminPassword(
  password: string,
  salt: string
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}\n${password}`)
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function passwordMatches(
  password: string,
  salt: string | undefined,
  hash: string | undefined
): Promise<boolean> {
  if (!salt || salt.length < MIN_TOKEN_LENGTH || !hash) {
    return false;
  }

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > 200
  ) {
    return false;
  }

  const actual = await hashAdminPassword(password, salt);
  return secretsMatch(actual, hash, 64);
}

export function parseLogin(
  input: unknown
):
  | { ok: true; username: string; password: string }
  | { ok: false } {
  if (!input || typeof input !== "object") return { ok: false };

  const source = input as Record<string, unknown>;

  if (
    typeof source.username !== "string" ||
    typeof source.password !== "string"
  ) {
    return { ok: false };
  }

  const username = source.username.trim();

  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) {
    return { ok: false };
  }

  if (
    source.password.length < MIN_PASSWORD_LENGTH ||
    source.password.length > 200
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    username,
    password: source.password
  };
}

export async function acceptAdminLogin(
  input: unknown,
  account: {
    username: string | undefined;
    salt: string | undefined;
    hash: string | undefined;
    token: string | undefined;
  }
): Promise<{ ok: true; token: string } | { ok: false }> {
  const parsed = parseLogin(input);
  const passwordOk = await passwordMatches(
    parsed.ok ? parsed.password : "placeholder-password",
    account.salt,
    account.hash
  );
  const usernameOk =
    parsed.ok &&
    secretsMatch(parsed.username, account.username, 3);

  if (
    !account.token ||
    account.token.length < MIN_TOKEN_LENGTH ||
    !parsed.ok ||
    !usernameOk ||
    !passwordOk
  ) {
    return { ok: false };
  }

  return { ok: true, token: account.token };
}
