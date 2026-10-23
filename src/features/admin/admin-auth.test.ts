import { describe, expect, it } from "vitest";

import {
  acceptAdminLogin,
  adminSessionCookie,
  clearAdminSessionCookie,
  hasAdminSession,
  hashAdminPassword,
  parseLogin,
  passwordMatches,
  readBearerToken,
  readCookie,
  tokensMatch,
  ADMIN_COOKIE
} from "./admin-auth";

const TOKEN = "local-admin-token-0123456789abcdef";

describe("Admin auth", () => {
  it("reads only a bearer token", () => {
    expect(readBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(readBearerToken(null)).toBeNull();
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readBearerToken("Bearer short")).toBeNull();
  });

  it("reads the session cookie and ignores the others", () => {
    expect(
      readCookie(`theme=light; ${ADMIN_COOKIE}=${TOKEN}`, ADMIN_COOKIE)
    ).toBe(TOKEN);
    expect(readCookie(null, ADMIN_COOKIE)).toBeNull();
    expect(readCookie("theme=light", ADMIN_COOKIE)).toBeNull();
    expect(hasAdminSession(`${ADMIN_COOKIE}=${TOKEN}`, TOKEN)).toBe(
      true
    );
    expect(hasAdminSession(`${ADMIN_COOKIE}=wrong-token-value-xx`, TOKEN)).toBe(
      false
    );
  });

  it("builds a same-origin session cookie and a clearer", () => {
    const issued = adminSessionCookie(TOKEN, false);
    const cleared = clearAdminSessionCookie(true);

    expect(issued).toContain(`${ADMIN_COOKIE}=${TOKEN}`);
    expect(issued).toContain("HttpOnly");
    expect(issued).toContain("SameSite=Strict");
    expect(issued).not.toContain("Secure");
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("Secure");
  });

  it("accepts the configured token and rejects the others", () => {
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true);
    expect(tokensMatch(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokensMatch("local-admin-token-0123456789abcdee", TOKEN)).toBe(
      false
    );
    expect(tokensMatch(TOKEN, undefined)).toBe(false);
    expect(tokensMatch(TOKEN, "short-secret")).toBe(false);
  });

  it("checks a password without keeping the original text", async () => {
    const salt = "0123456789abcdef";
    const hash = await hashAdminPassword("correct-horse", salt);

    expect(await passwordMatches("correct-horse", salt, hash)).toBe(
      true
    );
    expect(await passwordMatches("correct-horses", salt, hash)).toBe(
      false
    );
    expect(await passwordMatches("correct-horse", "short", hash)).toBe(
      false
    );
    expect(parseLogin({ username: "binhyen", password: "correct-horse" })).toEqual({
      ok: true,
      username: "binhyen",
      password: "correct-horse"
    });
    expect(parseLogin({ username: "a", password: "correct-horse" }).ok).toBe(
      false
    );
  });

  it("returns a session only after the right account", async () => {
    const salt = "0123456789abcdef";
    const hash = await hashAdminPassword("correct-horse", salt);
    const account = {
      username: "binhyen",
      salt,
      hash,
      token: TOKEN
    };

    expect(
      await acceptAdminLogin(
        { username: "binhyen", password: "correct-horse" },
        account
      )
    ).toEqual({ ok: true, token: TOKEN });
    expect(
      await acceptAdminLogin(
        { username: "binhyen", password: "wrong-password" },
        account
      )
    ).toEqual({ ok: false });
    expect(
      await acceptAdminLogin(
        { username: "binhyen", password: "correct-horse" },
        { ...account, token: "short" }
      )
    ).toEqual({ ok: false });
  });
});
