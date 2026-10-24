import { describe, expect, it } from "vitest";

import {
  contentKinds,
  contentMoods,
  contentThemes,
  contentTopics,
  type ContentTopic
} from "../content/content.types";
import type { MoodFilter, TopicFilter } from "../content/filter-contents";
import {
  FRESH_EVERY,
  RANK_KEY_MAX,
  assembleRingPage,
  decodeRingCursor,
  encodeRingCursor,
  freshRange,
  inFreshRange,
  inRingRange,
  isFresh,
  ringRange,
  startRingCursor,
  type LaneRows,
  type RingCursor,
  type RingItem,
  type RingLane
} from "./ring-feed";

interface Post extends RingItem {
  seq: number;
  topics: string[];
  moods: string[];
}

/** So gia ngau nhien co dinh de test lap lai duoc. */
function generator(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)] as T;
}

function makePosts(count: number, seed = 7): Post[] {
  const random = generator(seed);

  return Array.from({ length: count }, (_, index) => ({
    id: `p${String(index + 1).padStart(3, "0")}`,
    seq: index + 1,
    rankKey: Math.floor(random() * 1000),
    publishedAt: 1000 + index,
    theme: pick(contentThemes, random),
    kind: pick(contentKinds, random),
    topics: [pick(contentTopics, random)],
    moods: [pick(contentMoods, random)]
  }));
}

/** Trung voi bo loc ma loader se viet bang SQL. */
function matches(post: Post, lane: RingLane, cursor: RingCursor): boolean {
  const topics: readonly string[] =
    cursor.topic === "all" ? cursor.favorites : [cursor.topic];
  const topicOn = topics.length > 0;
  const moodOn = cursor.mood !== "all";
  const topicHit = post.topics.some((topic) => topics.includes(topic));
  const moodHit = post.moods.includes(cursor.mood);

  if (lane === "fresh") {
    return (
      (cursor.topic === "all" || post.topics.includes(cursor.topic)) &&
      (!moodOn || moodHit)
    );
  }

  if (lane === "preferred") {
    return (!topicOn || topicHit) && (!moodOn || moodHit);
  }

  if (lane === "related") return topicOn && moodOn && topicHit !== moodHit;

  return (!topicOn || !topicHit) && (!moodOn || !moodHit);
}

function readLane(
  posts: readonly Post[],
  cursor: RingCursor,
  lane: RingLane,
  limit: number
): LaneRows<Post> {
  let rows: Post[];

  if (lane === "fresh") {
    const range = freshRange(cursor.fresh, cursor.freshAt);
    if (!range) return { items: [], complete: true };

    rows = posts
      .filter((post) => inFreshRange(post, range) && matches(post, lane, cursor))
      .sort((a, b) => a.publishedAt - b.publishedAt || (a.id < b.id ? -1 : 1));
  } else {
    const range = ringRange(cursor[lane], cursor.origin);
    if (!range) return { items: [], complete: true };

    rows = posts
      .filter(
        (post) =>
          inRingRange(post, range) &&
          !isFresh(post.publishedAt, cursor.freshAt) &&
          matches(post, lane, cursor)
      )
      .sort((a, b) => a.rankKey - b.rankKey || (a.id < b.id ? -1 : 1));
  }

  return {
    items: rows.slice(0, limit + 1),
    complete: rows.length <= limit
  };
}

function drain(
  posts: readonly Post[],
  start: RingCursor,
  options: {
    limit?: number;
    seen?: ReadonlySet<number>;
    roundTrip?: boolean;
  } = {}
): { items: Post[]; steps: number } {
  const limit = options.limit ?? 7;
  const seen = options.seen ?? new Set<number>();
  let cursor = start;
  const items: Post[] = [];

  for (let steps = 1; steps <= 1000; steps++) {
    const lanes = {
      preferred: readLane(posts, cursor, "preferred", limit),
      related: readLane(posts, cursor, "related", limit),
      surprise: readLane(posts, cursor, "surprise", limit),
      fresh: readLane(posts, cursor, "fresh", limit)
    };
    const page = assembleRingPage(lanes, cursor, limit, (post) =>
      seen.has(post.seq)
    );

    items.push(...page.items);

    if (!page.hasMore) return { items, steps };

    cursor = options.roundTrip
      ? (decodeRingCursor(encodeRingCursor(page.cursor)) as RingCursor)
      : page.cursor;
  }

  throw new Error("feed did not finish");
}

function ids(items: readonly Post[]): string[] {
  return items.map((item) => item.id);
}

function start(
  topic: TopicFilter,
  mood: MoodFilter,
  origin: number,
  freshAt: number | null = null,
  favorites: readonly ContentTopic[] = []
): RingCursor {
  return startRingCursor({ topic, mood, origin, freshAt, favorites });
}

describe("ring feed", () => {
  const posts = makePosts(120);

  it("đi hết một vòng: mỗi bài đúng một lần rồi dừng", () => {
    const { items } = drain(posts, start("all", "all", 437));

    expect(items).toHaveLength(posts.length);
    expect(new Set(ids(items)).size).toBe(posts.length);
  });

  it("đi từ origin tới cuối vòng rồi quay về đầu, dừng trước origin", () => {
    const origin = 437;
    const { items } = drain(posts, start("all", "all", origin));
    const keys = items.map((item) => item.rankKey);
    const turn = keys.findIndex((key) => key < origin);

    expect(turn).toBeGreaterThan(0);
    expect(keys.slice(0, turn).every((key) => key >= origin)).toBe(true);
    expect(keys.slice(turn).every((key) => key < origin)).toBe(true);
    expect(keys.slice(0, turn)).toEqual([...keys.slice(0, turn)].sort((a, b) => a - b));
    expect(keys.slice(turn)).toEqual([...keys.slice(turn)].sort((a, b) => a - b));
  });

  it("origin ở hai đầu vòng vẫn phủ đủ", () => {
    for (const origin of [0, RANK_KEY_MAX]) {
      const { items } = drain(posts, start("all", "all", origin));
      expect(new Set(ids(items)).size).toBe(posts.length);
    }
  });

  it("bài trùng rank_key được phân định bằng id, không mất bài nào", () => {
    const tied = posts.map((post) => ({ ...post, rankKey: post.seq % 3 }));
    const { items } = drain(tied, start("all", "all", 1), { limit: 4 });

    expect(new Set(ids(items)).size).toBe(tied.length);
  });

  it("bỏ qua bài đã xem, không trả lại và không kẹt", () => {
    const seen = new Set(posts.filter((post) => post.seq % 2 === 0).map((post) => post.seq));
    const { items } = drain(posts, start("all", "all", 437), { seen });

    expect(items).toHaveLength(posts.length - seen.size);
    expect(items.every((item) => !seen.has(item.seq))).toBe(true);
  });

  it("đã xem hết thì trả rỗng và kết thúc sau số bước hữu hạn", () => {
    const seen = new Set(posts.map((post) => post.seq));
    const { items, steps } = drain(posts, start("all", "all", 437), { seen });

    expect(items).toHaveLength(0);
    expect(steps).toBeLessThan(posts.length);
  });

  it("lưu cursor rồi đọc tiếp cho kết quả như đọc liền một mạch", () => {
    const cursor = start("science", "curious", 300, 1080);
    const direct = drain(posts, cursor);
    const resumed = drain(posts, cursor, { roundTrip: true });

    expect(ids(resumed.items)).toEqual(ids(direct.items));
  });

  it("bộ lọc chủ đề + tâm trạng: mỗi bài hợp lệ đúng một lần", () => {
    const cursor = start("science", "curious", 300);
    const { items } = drain(posts, cursor);

    expect(new Set(ids(items)).size).toBe(items.length);
    expect(items).toHaveLength(posts.length);
  });

  it("chủ đề yêu thích: ưu tiên nhóm yêu thích nhưng vẫn phủ cả kho", () => {
    const cursor = start("all", "all", 500, null, ["nature", "peace"]);
    const { items } = drain(posts, cursor);
    const firstTen = items.slice(0, 10);
    const favored = firstTen.filter((item) =>
      item.topics.some((topic) => topic === "nature" || topic === "peace")
    );

    expect(new Set(ids(items)).size).toBe(posts.length);
    expect(favored.length).toBeGreaterThan(firstTen.length / 2);
  });

  describe("luật tránh lặp", () => {
    // Moi bai "science" cung theme discovery nhung khac loai, nhu du lieu that.
    const sameTheme: Post[] = posts.map((post, index) => ({
      ...post,
      theme: post.topics.includes("science") ? "discovery" : post.theme,
      kind: contentKinds[index % contentKinds.length] as Post["kind"]
    }));
    const science = (items: readonly Post[]) =>
      items.filter((item) => item.topics.includes("science")).length;

    it("đang lọc: bài cùng theme vẫn đi liền nhau, phần lớn thẻ đúng chủ đề", () => {
      const { items } = drain(sameTheme, start("science", "all", 0));
      const firstTen = items.slice(0, 10);

      expect(science(firstTen)).toBeGreaterThanOrEqual(8);

      for (let index = 1; index < firstTen.length; index++) {
        expect(firstTen[index]?.kind).not.toBe(firstTen[index - 1]?.kind);
      }
    });

    it("Dành cho bạn: vẫn tránh hai thẻ liền nhau cùng theme", () => {
      const { items } = drain(posts, start("all", "all", 0, null, ["science", "nature"]));
      const firstTwenty = items.slice(0, 20);
      let repeats = 0;

      for (let index = 1; index < firstTwenty.length; index++) {
        if (firstTwenty[index]?.theme === firstTwenty[index - 1]?.theme) repeats += 1;
      }

      expect(repeats).toBeLessThanOrEqual(2);
    });
  });

  describe("làn bài mới", () => {
    const freshAt = 1100;
    const fresh = posts.filter((post) => post.publishedAt > freshAt);

    it("bài mới chỉ xuất hiện một lần, theo thứ tự đăng", () => {
      const { items } = drain(posts, start("all", "all", 437, freshAt));
      const freshShown = items.filter((item) => item.publishedAt > freshAt);

      expect(new Set(ids(items)).size).toBe(posts.length);
      expect(ids(freshShown)).toEqual(ids(fresh));
    });

    it("bài mới xen vào khoảng mỗi FRESH_EVERY thẻ, không dồn lên đầu", () => {
      const { items } = drain(posts, start("all", "all", 437, freshAt));
      const positions = items
        .map((item, index) => (item.publishedAt > freshAt ? index : -1))
        .filter((index) => index >= 0);

      const inFirstFifty = positions.filter((index) => index < 50).length;

      expect(positions[0]).toBeGreaterThanOrEqual(FRESH_EVERY - 1);
      expect(inFirstFifty).toBeGreaterThanOrEqual(5);
      expect(inFirstFifty).toBeLessThanOrEqual(50 / FRESH_EVERY + 2);
      expect(positions).toHaveLength(fresh.length);
    });

    it("chưa có mốc bài mới thì mọi bài đi trên vòng", () => {
      const cursor = start("all", "all", 437, null);

      expect(cursor.fresh.mode).toBe("done");
      expect(drain(posts, cursor).items).toHaveLength(posts.length);
    });
  });
});

describe("ring cursor encoding", () => {
  const posts = makePosts(40);

  function midway(cursor: RingCursor, pages: number): RingCursor {
    let current = cursor;

    for (let step = 0; step < pages; step++) {
      const lanes = {
        preferred: readLane(posts, current, "preferred", 3),
        related: readLane(posts, current, "related", 3),
        surprise: readLane(posts, current, "surprise", 3),
        fresh: readLane(posts, current, "fresh", 3)
      };
      current = assembleRingPage(lanes, current, 3).cursor;
    }

    return current;
  }

  it("mã hóa rồi giải mã giữ nguyên, kể cả khi đã quay vòng", () => {
    const wrapped = midway(start("all", "all", 900), 3);
    const states = [
      start("all", "all", 900),
      wrapped,
      midway(start("all", "all", 900, 1030), 4),
      midway(start("science", "curious", 120), 6),
      midway(start("all", "all", 600, null, ["peace", "cute"]), 30)
    ];

    expect(wrapped.preferred).toMatchObject({ mode: "after", wrapped: true });
    expect(states.at(-1)?.preferred.mode).toBe("done");

    for (const state of states) {
      const encoded = encodeRingCursor(state);

      expect(encoded.startsWith("v6:")).toBe(true);
      expect(encoded.length).toBeLessThanOrEqual(1024);
      expect(decodeRingCursor(encoded)).toEqual(state);
    }
  });

  it("nhóm không hợp với bộ lọc bị tắt ngay từ đầu", () => {
    const plain = start("all", "all", 1);
    const topicOnly = start("science", "all", 1);

    expect(plain.related.mode).toBe("done");
    expect(plain.surprise.mode).toBe("done");
    expect(topicOnly.related.mode).toBe("done");
    expect(topicOnly.surprise.mode).toBe("start");
    expect(start("science", "curious", 1).related.mode).toBe("start");
  });

  it("từ chối cursor sai hoặc bị sửa tay", () => {
    // v6:topic:mood:favorites:origin:freshAt:emitted:
    // preferred(7,8):related(9,10):surprise(11,12):fresh(13,14):theme:kind
    const valid = encodeRingCursor(start("all", "all", 5, 100));
    const parts = valid.split(":");
    const edit = (changes: Record<number, string>) =>
      parts.map((part, index) => changes[index] ?? part).join(":");

    expect(parts).toHaveLength(17);
    expect(decodeRingCursor(valid)).not.toBeNull();
    expect(decodeRingCursor(edit({ 7: "w12", 8: "p001" }))?.preferred).toEqual({
      mode: "after",
      wrapped: true,
      rankKey: 12,
      id: "p001"
    });

    expect(decodeRingCursor("")).toBeNull();
    expect(decodeRingCursor("v5:all:all:-:0:-:-:-:-:-:-:-:-:-")).toBeNull();
    expect(decodeRingCursor(edit({ 0: "v5" }))).toBeNull();
    expect(decodeRingCursor(edit({ 4: String(RANK_KEY_MAX + 1) }))).toBeNull();
    expect(decodeRingCursor(edit({ 1: "unknown" }))).toBeNull();
    // Nhom "related" bi bat khi khong loc gi.
    expect(decodeRingCursor(edit({ 9: "-", 10: "-" }))).toBeNull();
    // Khong co moc bai moi nhung lan bai moi chua xong.
    expect(decodeRingCursor(edit({ 5: "-" }))).toBeNull();
    // Dau "bat dau" di kem id that, hoac id co ky tu la.
    expect(decodeRingCursor(edit({ 8: "p001" }))).toBeNull();
    expect(decodeRingCursor(edit({ 7: "12", 8: "bad id" }))).toBeNull();
    expect(decodeRingCursor(edit({ 13: "x", 14: "-" }))).toBeNull();
    // Chu de yeu thich khi dang loc chu de.
    expect(decodeRingCursor(edit({ 1: "science", 3: "peace" }))).toBeNull();
    expect(decodeRingCursor(edit({ 15: "rainbow" }))).toBeNull();
    expect(decodeRingCursor(`${valid}${"x".repeat(1100)}`)).toBeNull();
  });

  it("không cho tạo cursor với origin hoặc mốc sai", () => {
    expect(() => start("all", "all", -1)).toThrow();
    expect(() => start("all", "all", RANK_KEY_MAX + 1)).toThrow();
    expect(() => start("all", "all", 1, -5)).toThrow();
  });
});
