import { describe, expect, it } from "vitest";

import {
  SESSION_COOKIE,
  login,
  logout,
  register,
  signOutCookies
} from "../account/account";
import { createD1AccountStore } from "../account/d1-account-store";
import { ACTOR_COOKIE } from "../actor/actor";
import { openTestDatabase } from "../../test/sqlite-d1";
import {
  mergeViewerFeedState,
  readFeedViewer,
  recordSeen
} from "./d1-viewer-state";
import { loadPublicFeed } from "./load-public-feed";
import { hasSeen } from "./seen-bits";

const NOW = 3_000_000;
const ANON = "AaAaAaAaAaAaAaAaAaAaAa";
const OTHER = "BbBbBbBbBbBbBbBbBbBbBb";
const EMAIL = "gop@local.test";
const PASSWORD = "mat-khau-du-dai";

function cookie(parts: Record<string, string>): string {
  return Object.entries(parts)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function seedContents(sqlite: ReturnType<typeof openTestDatabase>["sqlite"]) {
  for (let index = 1; index <= 8; index++) {
    sqlite
      .prepare(
        `INSERT INTO contents (id, slug, kind, status, category, title, theme, published_at, rank_key)
         VALUES (?, ?, 'quote', 'published', 't', 't', 'peace', ?, ?)`
      )
      .run(`p${index}`, `p${index}`, 1000 + index, index * 1000);
  }
}

describe("gộp feed khi đăng nhập / đăng xuất", () => {
  it("đăng ký: lịch sử ẩn danh thành lịch sử tài khoản; đăng xuất máy thành người mới", async () => {
    const { db, sqlite } = openTestDatabase();
    const store = createD1AccountStore(db);

    seedContents(sqlite);
    sqlite.prepare(`INSERT INTO actors (id) VALUES (?)`).run(ANON);

    await recordSeen(db, {
      key: `a:${ANON}`,
      userId: null,
      actorId: ANON,
      state: null,
      report: { ids: ["p1", "p2", "p3"], cursor: null },
      now: NOW
    });

    const created = await register(
      store,
      { email: EMAIL, password: PASSWORD, displayName: "Gop" },
      ANON,
      NOW
    );
    if (!created.ok) throw new Error("register failed");

    await mergeViewerFeedState(db, {
      userId: created.user.id,
      actorId: ANON,
      now: NOW
    });

    const sessionCookie = cookie({ [SESSION_COOKIE]: created.token });
    const signedIn = await readFeedViewer(db, sessionCookie, NOW);
    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 8,
      viewer: signedIn,
      origin: () => 0
    });

    expect(signedIn.key).toBe(`u:${created.user.id}`);
    expect(signedIn.state?.seenCount).toBe(3);
    expect(page.items.map((item) => item.id)).not.toEqual(
      expect.arrayContaining(["p1", "p2", "p3"])
    );
    expect(page.items.every((item) => !["p1", "p2", "p3"].includes(item.id))).toBe(
      true
    );

    await logout(store, sessionCookie);
    for (const cleared of signOutCookies(false)) {
      expect(cleared).toMatch(/Max-Age=0/);
    }

    // May sau khi dang xuat: khong con cookie -> khong mang lich su tai khoan.
    const device = await readFeedViewer(db, null, NOW);
    expect(device).toMatchObject({ key: null, state: null, userId: null });

    const freshPage = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 3,
      viewer: device,
      origin: () => 0
    });
    expect(freshPage.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(["p1"])
    );
  });

  it("đăng nhập lại trên máy đã xem ẩn danh: gộp OR, không mất bài đã xem ở tài khoản", async () => {
    const { db, sqlite } = openTestDatabase();
    const store = createD1AccountStore(db);

    seedContents(sqlite);

    const created = await register(
      store,
      { email: EMAIL, password: PASSWORD },
      null,
      NOW,
      () => ANON
    );
    if (!created.ok) throw new Error("register failed");

    await recordSeen(db, {
      key: `u:${created.user.id}`,
      userId: created.user.id,
      actorId: ANON,
      state: null,
      report: { ids: ["p1", "p2"], cursor: null },
      now: NOW
    });

    await logout(store, cookie({ [SESSION_COOKIE]: created.token }));

    // May khac / phien an danh moi xem them p3, p4.
    sqlite.prepare(`INSERT INTO actors (id) VALUES (?)`).run(OTHER);
    await recordSeen(db, {
      key: `a:${OTHER}`,
      userId: null,
      actorId: OTHER,
      state: null,
      report: { ids: ["p3", "p4"], cursor: null },
      now: NOW + 10
    });

    const signed = await login(
      store,
      { email: EMAIL, password: PASSWORD },
      OTHER,
      NOW + 20
    );
    if (!signed.ok) throw new Error("login failed");

    await mergeViewerFeedState(db, {
      userId: signed.user.id,
      actorId: OTHER,
      now: NOW + 20
    });

    const viewer = await readFeedViewer(
      db,
      cookie({ [SESSION_COOKIE]: signed.token, [ACTOR_COOKIE]: signed.actorId }),
      NOW + 20
    );
    const seen = [1, 2, 3, 4, 5, 6, 7, 8].filter((seq) =>
      hasSeen(viewer.state?.seen ?? new Uint8Array(0), seq)
    );

    expect(viewer.state?.seenCount).toBe(4);
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(
      (
        sqlite
          .prepare(
            `SELECT COUNT(*) AS n FROM viewer_feed_state WHERE viewer_key = ?`
          )
          .get(`a:${OTHER}`) as { n: number }
      ).n
    ).toBe(0);

    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 8,
      viewer,
      origin: () => 0
    });
    expect(page.items.map((item) => item.id)).toEqual(["p5", "p6", "p7", "p8"]);
  });
});
