import { describe, expect, it } from "vitest";

import {
  currentUser,
  hashSessionToken,
  login,
  logout,
  normalizeEmail,
  readSessionToken,
  register,
  signOutCookies,
  type AccountStore,
  type PublicUser,
  type UserRecord
} from "./account";

interface MemoryStore extends AccountStore {
  users: UserRecord[];
  sessions: Map<string, { userId: string; expiresAt: number }>;
  actors: Map<string, string | null>;
  merges: Array<[string, string]>;
}

function memoryStore(): MemoryStore {
  const users: UserRecord[] = [];
  const sessions = new Map<string, { userId: string; expiresAt: number }>();
  const actors = new Map<string, string | null>();
  const merges: Array<[string, string]> = [];

  return {
    users,
    sessions,
    actors,
    merges,
    async findUserByEmail(email) {
      return users.find((user) => user.email === email) ?? null;
    },
    async createUser(user) {
      if (users.some((item) => item.email === user.email)) return false;
      users.push(user);
      return true;
    },
    async createSession(tokenHash, userId, _now, expiresAt) {
      sessions.set(tokenHash, { userId, expiresAt });
    },
    async findSessionUser(tokenHash, now): Promise<PublicUser | null> {
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt <= now) return null;

      const user = users.find((item) => item.id === session.userId);
      return user
        ? { id: user.id, email: user.email, displayName: user.displayName }
        : null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async primaryActor(userId) {
      for (const [id, owner] of actors) if (owner === userId) return id;
      return null;
    },
    async claimActor(actorId, userId) {
      if (!actors.has(actorId) || actors.get(actorId) !== null) return false;
      actors.set(actorId, userId);
      return true;
    },
    async createActor(actorId, userId) {
      actors.set(actorId, userId);
    },
    async mergeActor(fromId, intoId) {
      if (actors.get(fromId) !== null) return;
      merges.push([fromId, intoId]);
      actors.delete(fromId);
    }
  };
}

const ANON = "A".repeat(22);
const OTHER_ANON = "B".repeat(22);
const input = {
  email: "  Lan@Example.com ",
  password: "mat-khau-8",
  displayName: "  Lan   Anh "
};

describe("account inputs", () => {
  it("normalizes email", () => {
    expect(normalizeEmail(" A@B.vn ")).toBe("a@b.vn");
    expect(normalizeEmail("khong-phai-email")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it("rejects short passwords and bad names", async () => {
    const store = memoryStore();

    expect(
      await register(store, { ...input, password: "ngan" }, null, 1)
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await register(store, { ...input, displayName: "x".repeat(61) }, null, 1)
    ).toEqual({ ok: false, reason: "invalid" });
    expect(store.users).toHaveLength(0);
  });

  it("only reads well-formed session tokens", () => {
    expect(readSessionToken(`binhyen_session=${"a".repeat(43)}`)).toBe(
      "a".repeat(43)
    );
    expect(readSessionToken("binhyen_session=short")).toBeNull();
    expect(readSessionToken(null)).toBeNull();
  });

  it("clears session and actor cookies on sign out", () => {
    const cookies = signOutCookies(true);

    expect(cookies[0]).toContain("binhyen_session=;");
    expect(cookies[1]).toContain("binhyen_actor=;");
    expect(cookies.every((item) => item.includes("Max-Age=0"))).toBe(true);
  });
});

describe("register and login", () => {
  it("registers, claims the anonymous actor and starts a session", async () => {
    const store = memoryStore();
    store.actors.set(ANON, null);

    const result = await register(store, input, ANON, 100);
    if (!result.ok) throw new Error("expected success");

    expect(result.user.email).toBe("lan@example.com");
    expect(result.user.displayName).toBe("Lan Anh");
    expect(result.actorId).toBe(ANON);
    expect(store.actors.get(ANON)).toBe(result.user.id);
    expect(store.users[0]?.passwordHash).not.toContain("mat-khau-8");
    expect(store.sessions.has(await hashSessionToken(result.token))).toBe(true);
  });

  it("refuses a taken email", async () => {
    const store = memoryStore();

    await register(store, input, null, 100, () => "N".repeat(22));
    expect(
      await register(store, { ...input, email: "LAN@example.com" }, null, 101)
    ).toEqual({ ok: false, reason: "taken" });
  });

  it("logs in and merges another browser's actor into the account", async () => {
    const store = memoryStore();
    const first = await register(store, input, null, 100, () => "P".repeat(22));
    if (!first.ok) throw new Error("expected success");

    store.actors.set(OTHER_ANON, null);
    const result = await login(
      store,
      { email: "lan@example.com", password: "mat-khau-8" },
      OTHER_ANON,
      200
    );
    if (!result.ok) throw new Error("expected success");

    expect(result.actorId).toBe("P".repeat(22));
    expect(store.merges).toEqual([[OTHER_ANON, "P".repeat(22)]]);
  });

  it("never merges an actor owned by another account", async () => {
    const store = memoryStore();
    await register(store, input, null, 100, () => "P".repeat(22));
    store.actors.set(OTHER_ANON, "someone-else");

    await login(
      store,
      { email: "lan@example.com", password: "mat-khau-8" },
      OTHER_ANON,
      200
    );

    expect(store.merges).toEqual([]);
    expect(store.actors.get(OTHER_ANON)).toBe("someone-else");
  });

  it("gives the same answer for unknown email and wrong password", async () => {
    const store = memoryStore();
    await register(store, input, null, 100, () => "P".repeat(22));

    expect(
      await login(store, { email: "lan@example.com", password: "sai-mat-khau" }, null, 200)
    ).toEqual({ ok: false, reason: "wrong" });
    expect(
      await login(store, { email: "ai@example.com", password: "mat-khau-8" }, null, 200)
    ).toEqual({ ok: false, reason: "wrong" });
  });

  it("reads and ends the session", async () => {
    const store = memoryStore();
    const result = await register(store, input, null, 100, () => "P".repeat(22));
    if (!result.ok) throw new Error("expected success");

    const cookie = `binhyen_session=${result.token}`;
    expect((await currentUser(store, cookie, 200))?.email).toBe(
      "lan@example.com"
    );

    await logout(store, cookie);
    expect(await currentUser(store, cookie, 200)).toBeNull();
  });
});
