import { describe, expect, it } from "vitest";

import { SESSION_COOKIE, hashSessionToken } from "../account/account";
import { ACTOR_COOKIE } from "../actor/actor";
import { openTestDatabase } from "../../test/sqlite-d1";
import {
  ANONYMOUS_VIEWER,
  MAX_SEEN_WRITE_ATTEMPTS,
  ViewerStateBusyError,
  readFeedViewer,
  recordSeen,
  resetViewerLoop,
  type ViewerState
} from "./d1-viewer-state";
import { encodeRingCursor, startRingCursor } from "./ring-feed";
import { hasSeen, markSeen, seenBlob } from "./seen-bits";

const USER = "3f6c1d2e-9a4b-4c8d-8e7f-0a1b2c3d4e5f";
const ACTOR = "AbCdEfGhIjKlMnOpQrStUv";
const OTHER_ACTOR = "ZyXwVuTsRqPoNmLkJiHgFe";
const TOKEN = "a".repeat(43);
const NOW = 2_000_000;

async function setup() {
  const test = openTestDatabase();
  const { sqlite } = test;

  sqlite
    .prepare(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES (?, 'u@b.vn', 'U', ?)`
    )
    .run(USER, "x".repeat(40));
  sqlite
    .prepare(
      `INSERT INTO user_sessions (token_hash, user_id, expires_at)
       VALUES (?, ?, ?)`
    )
    .run(await hashSessionToken(TOKEN), USER, NOW + 100);
  sqlite
    .prepare(`INSERT INTO user_topics (user_id, topic_slug) VALUES (?, 'nature'), (?, 'peace')`)
    .run(USER, USER);
  sqlite
    .prepare(`INSERT INTO actors (id, user_id) VALUES (?, ?), (?, NULL)`)
    .run(OTHER_ACTOR, USER, ACTOR);

  for (let index = 1; index <= 4; index++) {
    sqlite
      .prepare(
        `INSERT INTO contents (id, slug, kind, status, category, title, theme, published_at)
         VALUES (?, ?, 'quote', 'published', 't', 't', 'peace', 1)`
      )
      .run(`c${index}`, `c${index}`);
  }

  const insertState = sqlite.prepare(
    `INSERT INTO viewer_feed_state
       (viewer_key, seen_bits, seen_count, positions_json, fresh_at, version)
     VALUES (?, ?, ?, ?, ?, 3)`
  );

  insertState.run(
    `a:${ACTOR}`,
    new Uint8Array(seenBlob(markSeen(new Uint8Array(0), [1, 2]).bits)),
    2,
    JSON.stringify({ "all:all": "v6:x" }),
    500
  );
  insertState.run(
    `u:${USER}`,
    new Uint8Array(seenBlob(markSeen(new Uint8Array(0), [1, 2, 3, 4]).bits)),
    4,
    "{}",
    700
  );

  return test;
}

const cookie = (parts: Record<string, string>) =>
  Object.entries(parts)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

describe("readFeedViewer", () => {
  it("không có cookie: không gọi DB", async () => {
    const { db, counter } = await setup();
    const viewer = await readFeedViewer(db, null, NOW);

    expect(viewer).toEqual(ANONYMOUS_VIEWER);
    expect(counter.statements).toBe(0);
  });

  it("ẩn danh: đọc trạng thái theo mã ẩn danh trong một batch", async () => {
    const { db, counter } = await setup();
    const viewer = await readFeedViewer(db, cookie({ [ACTOR_COOKIE]: ACTOR }), NOW);

    expect(counter.statements).toBe(2);
    expect(viewer.key).toBe(`a:${ACTOR}`);
    expect(viewer.userId).toBeNull();
    expect(viewer.favorites).toEqual([]);
    expect(viewer.state?.freshAt).toBe(500);
    expect(viewer.state?.version).toBe(3);
    expect(viewer.state?.positions.get("all:all")).toBe("v6:x");
    expect(hasSeen(viewer.state?.seen ?? new Uint8Array(0), 2)).toBe(true);
    expect(hasSeen(viewer.state?.seen ?? new Uint8Array(0), 3)).toBe(false);
  });

  it("đăng nhập: theo tài khoản dù trình duyệt còn mã ẩn danh khác", async () => {
    const { db } = await setup();
    const viewer = await readFeedViewer(
      db,
      cookie({ [SESSION_COOKIE]: TOKEN, [ACTOR_COOKIE]: ACTOR }),
      NOW
    );

    expect(viewer.key).toBe(`u:${USER}`);
    expect(viewer.userId).toBe(USER);
    expect([...viewer.favorites].sort()).toEqual(["nature", "peace"]);
    expect(viewer.state?.freshAt).toBe(700);
    expect(viewer.state?.seenCount).toBe(4);
  });

  it("phiên hết hạn: quay về mã ẩn danh", async () => {
    const { db } = await setup();
    const viewer = await readFeedViewer(
      db,
      cookie({ [SESSION_COOKIE]: TOKEN, [ACTOR_COOKIE]: ACTOR }),
      NOW + 1000
    );

    expect(viewer.key).toBe(`a:${ACTOR}`);
    expect(viewer.userId).toBeNull();
    expect(viewer.state?.freshAt).toBe(500);
  });

  it("chưa có dòng trạng thái: state = null", async () => {
    const { db } = await setup();
    const viewer = await readFeedViewer(
      db,
      cookie({ [ACTOR_COOKIE]: "QqQqQqQqQqQqQqQqQqQqQq" }),
      NOW
    );

    expect(viewer.key).toBe("a:QqQqQqQqQqQqQqQqQqQqQq");
    expect(viewer.state).toBeNull();
  });
});

describe("resetViewerLoop", () => {
  it("xóa lịch sử, chỉ giữ bài đã thích/lưu của mọi mã thuộc tài khoản", async () => {
    const { db, sqlite } = await setup();

    sqlite
      .prepare(
        `INSERT INTO content_reactions (content_id, actor_id, kind)
         VALUES ('c2', ?, 'like'), ('c3', ?, 'save'), ('c4', ?, 'like')`
      )
      .run(OTHER_ACTOR, OTHER_ACTOR, "MmMmMmMmMmMmMmMmMmMmMm");

    const viewer = await readFeedViewer(
      db,
      cookie({ [SESSION_COOKIE]: TOKEN, [ACTOR_COOKIE]: ACTOR }),
      NOW
    );
    const kept = await resetViewerLoop(db, viewer, NOW);
    const after = await readFeedViewer(
      db,
      cookie({ [SESSION_COOKIE]: TOKEN }),
      NOW
    );

    expect([1, 2, 3, 4].filter((seq) => hasSeen(kept, seq))).toEqual([2, 3]);
    expect(after.state?.seenCount).toBe(2);
    expect([1, 2, 3, 4].filter((seq) => hasSeen(after.state?.seen ?? new Uint8Array(0), seq))).toEqual([2, 3]);
    expect(after.state?.loopCount).toBe(1);
    expect(after.state?.version).toBe(4);
    expect(after.state?.positions.size).toBe(0);
  });

  it("thiết bị khác vừa ghi (version lệch): không ghi đè", async () => {
    const { db, sqlite } = await setup();
    const viewer = await readFeedViewer(db, cookie({ [ACTOR_COOKIE]: ACTOR }), NOW);

    sqlite
      .prepare(`UPDATE viewer_feed_state SET version = 9 WHERE viewer_key = ?`)
      .run(`a:${ACTOR}`);

    await resetViewerLoop(db, viewer, NOW);

    const after = await readFeedViewer(db, cookie({ [ACTOR_COOKIE]: ACTOR }), NOW);

    expect(after.state?.seenCount).toBe(2);
    expect(after.state?.loopCount).toBe(0);
  });

  it("chưa có trạng thái thì không ghi gì", async () => {
    const { db, counter } = await setup();
    const kept = await resetViewerLoop(db, ANONYMOUS_VIEWER, NOW);

    expect(kept.length).toBe(0);
    expect(counter.statements).toBe(0);
  });
});

describe("recordSeen", () => {
  const NEW_ACTOR = "NnNnNnNnNnNnNnNnNnNnNn";
  const seqsOf = (state: ViewerState | null | undefined) =>
    [1, 2, 3, 4, 5, 6].filter((seq) => hasSeen(state?.seen ?? new Uint8Array(0), seq));
  const scienceCursor = startRingCursor({
    topic: "science",
    mood: "all",
    origin: 77,
    freshAt: 500
  });
  const report = (ids: string[], withCursor = false) => ({
    ids,
    cursor: withCursor ? scienceCursor : null
  });

  async function anonymous(test: Awaited<ReturnType<typeof setup>>, actor = ACTOR) {
    return readFeedViewer(test.db, cookie({ [ACTOR_COOKIE]: actor }), NOW);
  }

  it("ghi thêm bài vừa xem, tăng version, giữ vị trí cũ", async () => {
    const test = await setup();
    const viewer = await anonymous(test);
    const outcome = await recordSeen(test.db, {
      key: `a:${ACTOR}`,
      userId: null,
      actorId: ACTOR,
      state: viewer.state,
      report: report(["c3", "c4", "c3"]),
      now: NOW
    });
    const after = await anonymous(test);

    expect(outcome).toEqual({ written: true, added: 2, seenCount: 4 });
    expect(seqsOf(after.state)).toEqual([1, 2, 3, 4]);
    expect(after.state?.seenCount).toBe(4);
    expect(after.state?.version).toBe(4);
    expect(after.state?.positions.get("all:all")).toBe("v6:x");
    expect(after.state?.freshAt).toBe(500);
  });

  it("lưu vị trí của bộ lọc trong cursor", async () => {
    const test = await setup();
    const viewer = await anonymous(test);

    await recordSeen(test.db, {
      key: `a:${ACTOR}`,
      userId: null,
      actorId: ACTOR,
      state: viewer.state,
      report: report(["c3"], true),
      now: NOW
    });

    const after = await anonymous(test);

    expect([...(after.state?.positions.keys() ?? [])]).toEqual(["all:all", "science:all"]);
    expect(after.state?.positions.get("science:all")).toBe(
      encodeRingCursor(scienceCursor)
    );
  });

  it("không có gì mới: chỉ một lần đọc, không ghi", async () => {
    const test = await setup();
    const viewer = await anonymous(test);
    const before = test.counter.statements;
    const outcome = await recordSeen(test.db, {
      key: `a:${ACTOR}`,
      userId: null,
      actorId: ACTOR,
      state: viewer.state,
      report: report(["c1", "c2"]),
      now: NOW
    });

    expect(outcome.written).toBe(false);
    expect(test.counter.statements - before).toBe(1);
    expect((await anonymous(test)).state?.version).toBe(3);
  });

  it("bỏ qua bài nháp, bài đã ẩn và id lạ", async () => {
    const test = await setup();

    test.sqlite.exec(
      `INSERT INTO contents (id, slug, kind, status, category, title, theme, published_at)
       VALUES ('d1', 'd1', 'quote', 'draft', 't', 't', 'peace', NULL),
              ('d2', 'd2', 'quote', 'archived', 't', 't', 'peace', 3)`
    );

    const viewer = await anonymous(test);
    const outcome = await recordSeen(test.db, {
      key: `a:${ACTOR}`,
      userId: null,
      actorId: ACTOR,
      state: viewer.state,
      report: report(["d1", "d2", "nope"]),
      now: NOW
    });

    expect(outcome.written).toBe(false);
  });

  it("xem bài mới: mốc bài mới tiến tới bài ấy", async () => {
    const test = await setup();

    test.sqlite.exec(
      `INSERT INTO contents (id, slug, kind, status, category, title, theme, published_at)
       VALUES ('n1', 'n1', 'quote', 'published', 't', 't', 'peace', 900)`
    );

    const viewer = await anonymous(test);

    await recordSeen(test.db, {
      key: `a:${ACTOR}`,
      userId: null,
      actorId: ACTOR,
      state: viewer.state,
      report: report(["n1"]),
      now: NOW
    });

    expect((await anonymous(test)).state?.freshAt).toBe(900);
  });

  it("người mới: tạo dòng kèm bài đã thích/lưu, mốc bài mới = hiện tại", async () => {
    const test = await setup();

    test.sqlite.prepare(`INSERT INTO actors (id) VALUES (?)`).run(NEW_ACTOR);
    test.sqlite
      .prepare(`INSERT INTO content_reactions (content_id, actor_id, kind) VALUES ('c4', ?, 'save')`)
      .run(NEW_ACTOR);

    const outcome = await recordSeen(test.db, {
      key: `a:${NEW_ACTOR}`,
      userId: null,
      actorId: NEW_ACTOR,
      state: null,
      report: report(["c1"]),
      now: NOW
    });
    const after = await anonymous(test, NEW_ACTOR);

    expect(outcome).toEqual({ written: true, added: 1, seenCount: 2 });
    expect(seqsOf(after.state)).toEqual([1, 4]);
    expect(after.state?.freshAt).toBe(NOW);
    expect(after.state?.version).toBe(0);
    expect(after.state?.loopCount).toBe(0);
  });

  it("người mới chỉ báo bài đã thích: chưa cần tạo dòng", async () => {
    const test = await setup();

    test.sqlite.prepare(`INSERT INTO actors (id) VALUES (?)`).run(NEW_ACTOR);
    test.sqlite
      .prepare(`INSERT INTO content_reactions (content_id, actor_id, kind) VALUES ('c4', ?, 'like')`)
      .run(NEW_ACTOR);

    const outcome = await recordSeen(test.db, {
      key: `a:${NEW_ACTOR}`,
      userId: null,
      actorId: NEW_ACTOR,
      state: null,
      report: report(["c4"]),
      now: NOW
    });

    expect(outcome.written).toBe(false);
    expect((await anonymous(test, NEW_ACTOR)).state).toBeNull();
  });

  it("tài khoản mới có trạng thái: giữ bài đã thích của mọi mã thuộc tài khoản", async () => {
    const test = await setup();

    test.sqlite.prepare(`DELETE FROM viewer_feed_state WHERE viewer_key = ?`).run(`u:${USER}`);
    test.sqlite
      .prepare(`INSERT INTO content_reactions (content_id, actor_id, kind) VALUES ('c2', ?, 'like')`)
      .run(OTHER_ACTOR);

    await recordSeen(test.db, {
      key: `u:${USER}`,
      userId: USER,
      actorId: null,
      state: null,
      report: report(["c3"]),
      now: NOW
    });

    const after = await readFeedViewer(test.db, cookie({ [SESSION_COOKIE]: TOKEN }), NOW);

    expect(after.key).toBe(`u:${USER}`);
    expect(seqsOf(after.state)).toEqual([2, 3]);
  });

  it("thiết bị khác vừa ghi: đọc lại, gộp, không mất bài của bên kia", async () => {
    const test = await setup();
    const viewer = await anonymous(test);

    test.sqlite
      .prepare(
        `UPDATE viewer_feed_state
         SET seen_bits = ?, seen_count = 3, version = 8
         WHERE viewer_key = ?`
      )
      .run(new Uint8Array(seenBlob(markSeen(new Uint8Array(0), [1, 2, 3]).bits)), `a:${ACTOR}`);

    const outcome = await recordSeen(test.db, {
      key: `a:${ACTOR}`,
      userId: null,
      actorId: ACTOR,
      state: viewer.state,
      report: report(["c4"]),
      now: NOW
    });
    const after = await anonymous(test);

    expect(outcome).toEqual({ written: true, added: 1, seenCount: 4 });
    expect(seqsOf(after.state)).toEqual([1, 2, 3, 4]);
    expect(after.state?.version).toBe(9);
  });

  it("thiết bị khác vừa tạo dòng: chuyển sang cập nhật", async () => {
    const test = await setup();

    const outcome = await recordSeen(test.db, {
      key: `a:${ACTOR}`,
      userId: null,
      actorId: ACTOR,
      state: null,
      report: report(["c3"]),
      now: NOW
    });
    const after = await anonymous(test);

    expect(outcome.written).toBe(true);
    expect(seqsOf(after.state)).toEqual([1, 2, 3]);
    expect(after.state?.freshAt).toBe(500);
    expect(after.state?.version).toBe(4);
  });

  it("bị chen mãi: dừng sau số lần giới hạn", async () => {
    const test = await setup();
    const viewer = await anonymous(test);
    let updates = 0;
    const racing = {
      batch: test.db.batch.bind(test.db),
      prepare(sql: string) {
        const statement = test.db.prepare(sql);

        if (!sql.includes("UPDATE viewer_feed_state")) return statement;

        return {
          bind: (...values: unknown[]) => ({
            run: async () => {
              updates += 1;
              test.sqlite.exec(`UPDATE viewer_feed_state SET version = version + 1`);
              return statement.bind(...values).run();
            }
          })
        };
      }
    } as unknown as D1Database;

    await expect(
      recordSeen(racing, {
        key: `a:${ACTOR}`,
        userId: null,
        actorId: ACTOR,
        state: viewer.state,
        report: report(["c4"]),
        now: NOW
      })
    ).rejects.toBeInstanceOf(ViewerStateBusyError);
    expect(updates).toBe(MAX_SEEN_WRITE_ATTEMPTS);
  });

  it("state khác khóa: từ chối", async () => {
    const test = await setup();
    const viewer = await anonymous(test);

    await expect(
      recordSeen(test.db, {
        key: `u:${USER}`,
        userId: USER,
        actorId: null,
        state: viewer.state,
        report: report(["c4"]),
        now: NOW
      })
    ).rejects.toThrow();
  });

  it("kế hoạch truy vấn: tìm theo khóa và index, không quét bảng", () => {
    const { sqlite } = openTestDatabase();
    const plan = (sql: string) =>
      (sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>)
        .map((row) => row.detail)
        .join(" | ");

    const targets = plan(
      `SELECT seq, published_at FROM contents
       WHERE id IN ('a', 'b') AND status = 'published' AND published_at IS NOT NULL AND seq > 0`
    );
    const kept = plan(
      `SELECT DISTINCT c.seq
       FROM content_reactions r
       JOIN contents c ON c.id = r.content_id
       WHERE c.seq > 0
         AND (
           r.actor_id IN (SELECT a.id FROM actors a WHERE a.user_id = 'u')
           OR r.actor_id = 'a'
         )`
    );

    expect(targets).toMatch(/SEARCH contents USING INDEX sqlite_autoindex_contents_1 \(id=\?\)/);
    expect(kept).toMatch(/MULTI-INDEX OR/);
    expect(kept).toMatch(/SEARCH a USING INDEX idx_actors_user \(user_id=\?\)/);
    expect(kept.match(/SEARCH r USING INDEX idx_content_reactions_actor \(actor_id=\?\)/g)).toHaveLength(2);
    expect(kept).toMatch(/SEARCH c USING INDEX sqlite_autoindex_contents_1 \(id=\?\)/);
    expect(kept).not.toMatch(/SCAN/);
  });
});
