import { describe, expect, it } from "vitest";

import {
  ACTOR_COOKIE,
  actorCookie,
  isActorId,
  newActorId,
  readActorId,
  resolveActor,
  type ActorStore
} from "./actor";

const DAY = 60 * 60 * 24;
const KNOWN = "AbCdEfGhIjKlMnOpQrStUv";

function memoryStore(seed: Record<string, number> = {}) {
  const rows = new Map(Object.entries(seed));
  const calls: string[] = [];

  const store: ActorStore = {
    async find(id) {
      calls.push(`find:${id}`);
      const lastSeenAt = rows.get(id);
      return lastSeenAt === undefined ? null : { lastSeenAt };
    },
    async create(id, now) {
      calls.push(`create:${id}`);
      rows.set(id, now);
    },
    async touch(id, now) {
      calls.push(`touch:${id}`);
      rows.set(id, now);
    }
  };

  return { store, rows, calls };
}

describe("newActorId", () => {
  it("tạo mã 22 ký tự hợp lệ và khác nhau mỗi lần", () => {
    const first = newActorId();
    const second = newActorId();

    expect(first).toHaveLength(22);
    expect(isActorId(first)).toBe(true);
    expect(first).not.toBe(second);
  });
});

describe("actorCookie", () => {
  it("cookie HttpOnly, Lax, sống một năm, chỉ thêm Secure khi https", () => {
    const local = actorCookie(KNOWN, false);

    expect(local).toContain(`${ACTOR_COOKIE}=${KNOWN}`);
    expect(local).toContain("HttpOnly");
    expect(local).toContain("SameSite=Lax");
    expect(local).toContain(`Max-Age=${DAY * 365}`);
    expect(local).not.toContain("Secure");
    expect(actorCookie(KNOWN, true)).toContain("Secure");
  });
});

describe("readActorId", () => {
  it("bỏ qua cookie thiếu, sai định dạng hoặc quá dài", () => {
    expect(readActorId(null)).toBeNull();
    expect(readActorId(`${ACTOR_COOKIE}=short`)).toBeNull();
    expect(readActorId(`${ACTOR_COOKIE}=${KNOWN}x`)).toBeNull();
    expect(readActorId(`${ACTOR_COOKIE}=${"a".repeat(21)}%27`)).toBeNull();
    expect(readActorId(`theme=dark; ${ACTOR_COOKIE}=${KNOWN}`)).toBe(KNOWN);
  });
});

describe("resolveActor", () => {
  it("chưa có cookie thì tạo mã mới và đặt cookie", async () => {
    const { store, rows } = memoryStore();
    const actor = await resolveActor(store, null, 1000, () => KNOWN);

    expect(actor).toEqual({ id: KNOWN, created: true, setCookie: true });
    expect(rows.get(KNOWN)).toBe(1000);
  });

  it("mã cũ còn mới thì dùng lại, không ghi database, không gửi lại cookie", async () => {
    const { store, calls } = memoryStore({ [KNOWN]: 1000 });
    const actor = await resolveActor(
      store,
      `${ACTOR_COOKIE}=${KNOWN}`,
      1000 + DAY - 1
    );

    expect(actor).toEqual({ id: KNOWN, created: false, setCookie: false });
    expect(calls).toEqual([`find:${KNOWN}`]);
  });

  it("mã cũ quá một ngày thì cập nhật lần thấy cuối và gia hạn cookie", async () => {
    const { store, rows } = memoryStore({ [KNOWN]: 1000 });
    const actor = await resolveActor(
      store,
      `${ACTOR_COOKIE}=${KNOWN}`,
      1000 + DAY
    );

    expect(actor).toEqual({ id: KNOWN, created: false, setCookie: true });
    expect(rows.get(KNOWN)).toBe(1000 + DAY);
  });

  it("cookie hợp lệ nhưng không có trong database thì cấp mã mới", async () => {
    const { store } = memoryStore();
    const fresh = "ZyXwVuTsRqPoNmLkJiHgFe";
    const actor = await resolveActor(
      store,
      `${ACTOR_COOKIE}=${KNOWN}`,
      5,
      () => fresh
    );

    expect(actor).toEqual({ id: fresh, created: true, setCookie: true });
  });
});
