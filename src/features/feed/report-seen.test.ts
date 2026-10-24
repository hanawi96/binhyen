import { describe, expect, it, vi } from "vitest";

import {
  SEEN_BATCH_SIZE,
  SEEN_PENDING_KEY,
  createSeenReporter,
  fitsSeenBody,
  parseSeenPending,
  readSeenPending,
  seenReportJson,
  takeSeenBatch,
  writeSeenPending
} from "./report-seen";
import { MAX_SEEN_IDS } from "./seen-report";

function memoryStorage() {
  const data = new Map<string, string>();

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    data
  };
}

describe("parseSeenPending / takeSeenBatch", () => {
  it("bỏ dữ liệu hỏng, giữ id hợp lệ", () => {
    expect(parseSeenPending(null)).toEqual([]);
    expect(parseSeenPending("nope")).toEqual([]);
    expect(
      parseSeenPending(
        JSON.stringify([
          { id: "a", cursor: "v6:x" },
          { id: "a", cursor: "v6:dup" },
          { id: "b c", cursor: null },
          { id: "b", cursor: null },
          "x"
        ])
      )
    ).toEqual([
      { id: "a", cursor: "v6:x" },
      { id: "b", cursor: null }
    ]);
  });

  it("cursor của lô là cursor của thẻ cuối", () => {
    const { body, rest } = takeSeenBatch(
      [
        { id: "a", cursor: "c1" },
        { id: "b", cursor: "c1" },
        { id: "c", cursor: "c2" },
        { id: "d", cursor: "c3" }
      ],
      3
    );

    expect(body).toEqual({ ids: ["a", "b", "c"], cursor: "c2" });
    expect(rest).toEqual([{ id: "d", cursor: "c3" }]);
  });

  it("body vừa SEEN_BODY_LIMIT với MAX_SEEN_IDS id", () => {
    const ids = Array.from({ length: MAX_SEEN_IDS }, (_, i) =>
      `${i}`.padStart(80, "x")
    );
    const body = {
      ids,
      cursor: `v6:${"y".repeat(400)}`
    };

    expect(fitsSeenBody(body)).toBe(true);
    expect(seenReportJson(body).length).toBeLessThanOrEqual(4096);
  });
});

describe("createSeenReporter", () => {
  it("đủ một lô thì tự gửi; gửi lại cùng id thì bỏ", async () => {
    const posts: string[] = [];
    const storage = memoryStorage();
    const reporter = createSeenReporter({
      origin: "http://feed.test",
      storage,
      batchSize: SEEN_BATCH_SIZE,
      fetch: async (_input, init) => {
        posts.push(String(init?.body));
        return new Response(JSON.stringify({ success: true, added: 5 }), {
          status: 200
        });
      }
    });

    for (let index = 1; index <= 5; index++) {
      reporter.mark(`p${index}`, "cursor-a");
    }

    reporter.mark("p1", "cursor-a");
    await vi.waitFor(() => expect(posts).toHaveLength(1));

    expect(JSON.parse(posts[0] ?? "")).toEqual({
      ids: ["p1", "p2", "p3", "p4", "p5"],
      cursor: "cursor-a"
    });
    expect(reporter.pendingCount()).toBe(0);
    expect(storage.data.has(SEEN_PENDING_KEY)).toBe(false);
  });

  it("gặp lỗi mạng thì giữ hàng đợi trong localStorage", async () => {
    const storage = memoryStorage();
    const reporter = createSeenReporter({
      origin: "http://feed.test",
      storage,
      batchSize: 2,
      fetch: async () => new Response("nope", { status: 500 })
    });

    reporter.mark("a", "c");
    reporter.mark("b", "c");
    await reporter.flush();

    expect(reporter.pendingCount()).toBe(2);
    expect(readSeenPending(storage).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("mở lại: đọc hàng đợi cũ rồi flush tiếp", async () => {
    const storage = memoryStorage();
    writeSeenPending(storage, [
      { id: "old1", cursor: null },
      { id: "old2", cursor: "c" }
    ]);

    const posts: string[] = [];
    const reporter = createSeenReporter({
      origin: "http://feed.test",
      storage,
      batchSize: 99,
      fetch: async (_input, init) => {
        posts.push(String(init?.body));
        return new Response("{}", { status: 200 });
      }
    });

    expect(reporter.pendingCount()).toBe(2);
    expect(await reporter.flush()).toBe(true);
    expect(JSON.parse(posts[0] ?? "").ids).toEqual(["old1", "old2"]);
    expect(reporter.pendingCount()).toBe(0);
  });

  it("flushOnLeave dùng sendBeacon và bỏ phần đã gửi khỏi hàng đợi", () => {
    const storage = memoryStorage();
    const beacons: string[] = [];
    const reporter = createSeenReporter({
      origin: "http://feed.test",
      storage,
      batchSize: 99,
      sendBeacon: (_url, data) => {
        beacons.push(typeof data === "string" ? data : String(data));
        return true;
      },
      fetch: async () => new Response("{}", { status: 200 })
    });

    reporter.mark("a", "c1");
    reporter.mark("b", "c2");
    reporter.flushOnLeave();

    expect(beacons).toHaveLength(1);
    expect(reporter.pendingCount()).toBe(0);
  });

  it("flushOnLeave thất bại thì vẫn giữ localStorage", () => {
    const storage = memoryStorage();
    const reporter = createSeenReporter({
      origin: "http://feed.test",
      storage,
      batchSize: 99,
      sendBeacon: () => false,
      fetch: async () => new Response("{}", { status: 200 })
    });

    reporter.mark("a", null);
    reporter.flushOnLeave();

    expect(reporter.pendingCount()).toBe(1);
    expect(readSeenPending(storage)).toEqual([{ id: "a", cursor: null }]);
  });
});
