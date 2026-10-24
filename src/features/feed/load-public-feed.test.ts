import type { DatabaseSync } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import {
  contentKinds,
  contentThemes,
  type ContentMood,
  type ContentTopic
} from "../content/content.types";
import type { MoodFilter, TopicFilter } from "../content/filter-contents";
import { ACTOR_COOKIE } from "../actor/actor";
import { openTestDatabase } from "../../test/sqlite-d1";
import {
  ANONYMOUS_VIEWER,
  readFeedViewer,
  recordSeen,
  resetViewerLoop,
  type FeedViewer
} from "./d1-viewer-state";
import {
  MAX_SCAN_ROWS,
  chooseStartCursor,
  freshLaneQuery,
  loadPublicFeed,
  ringLaneQuery
} from "./load-public-feed";
import {
  FRESH_EVERY,
  decodeRingCursor,
  encodeRingCursor,
  startRingCursor,
  type RingCursor
} from "./ring-feed";
import { markSeen } from "./seen-bits";
import { writePosition } from "./viewer-positions";

const AUTHOR = "0f8c1d2e-9a4b-4c8d-8e7f-0a1b2c3d4e5f";
const TOPICS: ContentTopic[] = ["peace", "science", "nature", "cute"];
const MOODS: ContentMood[] = ["calm", "curious", "happy"];

interface SeedPost {
  id: string;
  rankKey: number;
  publishedAt: number;
  topic: ContentTopic;
  mood: ContentMood;
  authorId?: string;
  status?: string;
}

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

function catalog(count: number, seed = 11): SeedPost[] {
  const random = generator(seed);

  return Array.from({ length: count }, (_, index) => ({
    id: `p${String(index + 1).padStart(4, "0")}`,
    rankKey: 1 + Math.floor(random() * 1_000_000),
    publishedAt: 1_000 + index,
    topic: TOPICS[index % TOPICS.length] as ContentTopic,
    mood: MOODS[index % MOODS.length] as ContentMood
  }));
}

function seed(sqlite: DatabaseSync, posts: readonly SeedPost[]): Map<string, number> {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO users (id, email, display_name, password_hash)
       VALUES (?, 'a@b.vn', 'A', ?)`
    )
    .run(AUTHOR, "x".repeat(40));

  const insert = sqlite.prepare(
    `INSERT INTO contents (
       id, slug, kind, status, category, title, theme,
       created_at, published_at, rank_key, author_id
     ) VALUES (?, ?, ?, ?, 'test', ?, ?, ?, ?, ?, ?)`
  );
  const topic = sqlite.prepare(
    `INSERT INTO content_topics (content_id, topic_slug) VALUES (?, ?)`
  );
  const mood = sqlite.prepare(
    `INSERT INTO content_moods (content_id, mood_slug) VALUES (?, ?)`
  );

  posts.forEach((post, index) => {
    insert.run(
      post.id,
      post.id,
      contentKinds[index % contentKinds.length] as string,
      post.status ?? "published",
      post.id,
      contentThemes[(index * 5) % contentThemes.length] as string,
      post.publishedAt,
      post.publishedAt,
      post.rankKey,
      post.authorId ?? null
    );
    topic.run(post.id, post.topic);
    mood.run(post.id, post.mood);
  });

  const seqs = new Map<string, number>();

  for (const row of sqlite
    .prepare(`SELECT id, seq FROM contents`)
    .all() as Array<{ id: string; seq: number }>) {
    seqs.set(row.id, row.seq);
  }

  return seqs;
}

function setup(posts: readonly SeedPost[]) {
  const test = openTestDatabase();
  const seqs = seed(test.sqlite, posts);
  return { ...test, seqs };
}

function viewerWith(input: {
  seenIds?: readonly string[];
  seqs?: Map<string, number>;
  freshAt?: number;
  positions?: Map<string, string>;
  userId?: string | null;
  favorites?: ContentTopic[];
}): FeedViewer {
  const seen = markSeen(
    new Uint8Array(0),
    (input.seenIds ?? []).map((id) => input.seqs?.get(id) ?? 0)
  );

  return {
    key: "a:AbCdEfGhIjKlMnOpQrStUv",
    userId: input.userId ?? null,
    actorId: "AbCdEfGhIjKlMnOpQrStUv",
    favorites: input.favorites ?? [],
    state: {
      key: "a:AbCdEfGhIjKlMnOpQrStUv",
      seen: seen.bits,
      seenCount: seen.added,
      positions: input.positions ?? new Map(),
      // Moc that la luc tao trang thai: moi bai mau deu dang truoc do.
      freshAt: input.freshAt ?? 9_999_999,
      loopCount: 0,
      version: 0
    }
  };
}

async function collect(
  db: D1Database,
  options: {
    count: number;
    topic?: TopicFilter;
    mood?: MoodFilter;
    viewer?: FeedViewer;
    limit?: number;
    origin?: number;
    onAllSeen?: () => Promise<Uint8Array>;
    roundTrip?: boolean;
  }
) {
  const topic = options.topic ?? "all";
  const mood = options.mood ?? "all";
  const ids: string[] = [];
  const notices: Array<string | null> = [];
  let cursor: RingCursor | null = null;
  let ended = false;
  let pages = 0;
  let matched: boolean | null = null;

  while (ids.length < options.count && pages < 500) {
    const page = await loadPublicFeed(db, {
      topic,
      mood,
      cursor,
      limit: options.limit ?? 7,
      viewer: options.viewer ?? ANONYMOUS_VIEWER,
      onAllSeen: options.onAllSeen,
      origin: () => options.origin ?? 500_000
    });

    pages += 1;
    matched ??= page.matched;
    ids.push(...page.items.map((item) => item.id));
    notices.push(page.notice);

    if (page.nextCursor === null) {
      ended = true;
      break;
    }

    cursor = decodeRingCursor(page.nextCursor);
    expect(cursor).not.toBeNull();
  }

  // Trang cuoi co the da sang dau vong sau; chi so sanh dung so bai can lay.
  return { ids: ids.slice(0, options.count), notices, ended, pages, matched };
}

function unique(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

describe("loadPublicFeed trên SQL thật", () => {
  const posts = catalog(90);
  const allIds = posts.map((post) => post.id).sort();

  it("người mới: đi hết kho, mỗi bài đúng một lần rồi mới lặp lại", async () => {
    const { db } = setup(posts);
    const { ids } = await collect(db, { count: posts.length * 2 });
    const first = ids.slice(0, posts.length);
    const second = ids.slice(posts.length, posts.length * 2);

    expect(unique(first)).toBe(true);
    expect([...first].sort()).toEqual(allIds);
    expect(second).toEqual(first);
  });

  it("thứ tự theo vòng: từ origin tới cuối rồi quay về đầu", async () => {
    const { db } = setup(posts);
    const origin = 400_000;
    const { ids } = await collect(db, { count: posts.length, origin });
    const keyOf = new Map(posts.map((post) => [post.id, post.rankKey]));
    const expected = [...posts]
      .sort((a, b) => a.rankKey - b.rankKey)
      .map((post) => post.id);
    const turn = expected.findIndex((id) => (keyOf.get(id) ?? 0) >= origin);
    const ring = [...expected.slice(turn), ...expected.slice(0, turn)];

    expect(ids).toEqual(ring);
  });

  it("trang đầu khác nhau tùy điểm xuất phát", async () => {
    const { db } = setup(posts);
    const a = await collect(db, { count: 5, origin: 100_000, limit: 5 });
    const b = await collect(db, { count: 5, origin: 700_000, limit: 5 });

    expect(a.ids).not.toEqual(b.ids);
  });

  it("đọc cursor đã mã hóa qua nhiều trang không mất, không trùng bài", async () => {
    const { db } = setup(posts);

    for (const limit of [1, 3, 20]) {
      const { ids } = await collect(db, { count: posts.length, limit });
      expect([...ids].sort()).toEqual(allIds);
    }
  });

  it("bỏ qua bài đã xem; không bao giờ trả bài đã xem", async () => {
    const { db, seqs } = setup(posts);
    const seenIds = posts.filter((_, index) => index % 3 !== 0).map((p) => p.id);
    const viewer = viewerWith({ seenIds, seqs });
    const unseen = posts.length - seenIds.length;
    const { ids } = await collect(db, { count: unseen * 2, viewer });

    expect(ids.some((id) => seenIds.includes(id))).toBe(false);
    expect(unique(ids.slice(0, unseen))).toBe(true);
    expect(ids.slice(0, unseen)).toHaveLength(unseen);
  });

  it("mở lại app hôm sau: đi tiếp từ chỗ dừng, không gặp lại bài đã xem", async () => {
    const { db, seqs } = setup(posts);
    const read = (viewer: FeedViewer, cursor: RingCursor | null) =>
      loadPublicFeed(db, {
        topic: "all",
        mood: "all",
        cursor,
        limit: 5,
        viewer,
        origin: () => 250_000
      });

    // Phien 1: xem trang 1 va 2; luu cursor bat dau trang 3 nhu buoc 4 se lam.
    const fresh = viewerWith({ seqs });
    const page1 = await read(fresh, null);
    const page2 = await read(fresh, decodeRingCursor(page1.nextCursor ?? ""));
    const seenToday = [...page1.items, ...page2.items].map((item) => item.id);
    const tomorrow = viewerWith({
      seqs,
      seenIds: seenToday,
      positions: writePosition(new Map(), "all", "all", page2.nextCursor ?? "")
    });

    // Phien 2: khong co cursor tu client, chi co trang thai da luu.
    const { ids } = await collect(db, {
      count: posts.length - seenToday.length,
      viewer: tomorrow,
      limit: 5,
      origin: 999_999
    });

    expect(ids.some((id) => seenToday.includes(id))).toBe(false);
    expect(unique(ids)).toBe(true);
    expect([...ids, ...seenToday].sort()).toEqual(allIds);

    const page3 = await read(fresh, decodeRingCursor(page2.nextCursor ?? ""));
    expect(ids.slice(0, 5)).toEqual(page3.items.map((item) => item.id));
  });

  it("vị trí lưu bị cũ (bài đã xem nằm phía trước): vẫn bỏ qua nhờ bitmap", async () => {
    const { db, seqs } = setup(posts);
    const first = await collect(db, { count: 20, limit: 5, origin: 250_000 });
    const stale = viewerWith({ seqs, seenIds: first.ids });
    const { ids } = await collect(db, {
      count: posts.length - 20,
      viewer: stale,
      origin: 250_000
    });

    expect(ids.some((id) => first.ids.includes(id))).toBe(false);
    expect([...ids, ...first.ids].sort()).toEqual(allIds);
  });

  it("đã xem hết: bắt đầu vòng mới, báo all-seen, giữ bài đã thích", async () => {
    const { db, seqs } = setup(posts);
    const loved = ["p0001", "p0002"];
    const viewer = viewerWith({ seenIds: posts.map((p) => p.id), seqs });
    const onAllSeen = vi.fn(async () =>
      markSeen(new Uint8Array(0), loved.map((id) => seqs.get(id) ?? 0)).bits
    );

    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 7,
      viewer,
      onAllSeen,
      origin: () => 1
    });

    expect(onAllSeen).toHaveBeenCalledTimes(1);
    expect(page.notice).toBe("all-seen");
    expect(page.items).toHaveLength(7);
    expect(page.items.some((item) => loved.includes(item.id))).toBe(false);
    expect(page.nextCursor).not.toBeNull();
  });

  it("đã xem hết nhưng không có cách bắt đầu lại thì kết thúc, không lặp vô hạn", async () => {
    const { db, seqs } = setup(posts);
    const viewer = viewerWith({ seenIds: posts.map((p) => p.id), seqs });
    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 7,
      viewer
    });

    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
    expect(page.hasMore).toBe(false);
  });

  it("bài chưa xem cuối cùng vừa nằm trong trang này: chưa bắt đầu vòng mới", async () => {
    const { db, seqs } = setup(posts);
    const left = posts.slice(0, 3).map((p) => p.id);
    const viewer = viewerWith({
      seenIds: posts.map((p) => p.id).filter((id) => !left.includes(id)),
      seqs
    });
    const onAllSeen = vi.fn(async () => new Uint8Array(0));
    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 7,
      viewer,
      onAllSeen
    });

    expect(onAllSeen).not.toHaveBeenCalled();
    expect(page.notice).toBeNull();
    expect([...page.items.map((item) => item.id)].sort()).toEqual(left);
    expect(page.nextCursor).not.toBeNull();
  });

  it("vòng mới mà vẫn không còn bài (toàn bài đã thích) thì kết thúc", async () => {
    const { db, seqs } = setup(posts.slice(0, 5));
    const ids = posts.slice(0, 5).map((p) => p.id);
    const viewer = viewerWith({ seenIds: ids, seqs });
    const onAllSeen = vi.fn(async () =>
      markSeen(new Uint8Array(0), ids.map((id) => seqs.get(id) ?? 0)).bits
    );
    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 7,
      viewer,
      onAllSeen
    });

    expect(onAllSeen).toHaveBeenCalledTimes(1);
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });

  it("kho rỗng: trả rỗng và kết thúc", async () => {
    const { db } = setup([]);
    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 3
    });

    expect(page).toMatchObject({ items: [], nextCursor: null, hasMore: false });
  });

  it("không hiện bài của chính người xem, bài nháp hoặc đã ẩn", async () => {
    const own = posts.slice(0, 10).map((post) => ({ ...post, authorId: AUTHOR }));
    const hidden = [
      { ...posts[10], status: "draft" },
      { ...posts[11], status: "archived" }
    ] as SeedPost[];
    const rest = posts.slice(12);
    const { db } = setup([...own, ...hidden, ...rest]);
    const viewer: FeedViewer = { ...ANONYMOUS_VIEWER, userId: AUTHOR };
    const { ids } = await collect(db, { count: rest.length, viewer });

    expect([...ids].sort()).toEqual(rest.map((post) => post.id).sort());

    const anonymous = await collect(db, { count: rest.length + own.length });
    expect(anonymous.ids).toContain(own[0]?.id);
    expect(anonymous.ids).not.toContain(hidden[0]?.id);
    expect(anonymous.ids).not.toContain(hidden[1]?.id);
  });

  it("lọc chủ đề: ưu tiên bài đúng chủ đề rồi vẫn phủ cả kho", async () => {
    const { db } = setup(posts);
    const { ids, matched } = await collect(db, {
      count: posts.length,
      topic: "science"
    });
    const science = new Set(
      posts.filter((post) => post.topic === "science").map((post) => post.id)
    );
    const firstTen = ids.slice(0, 10).filter((id) => science.has(id));

    expect(matched).toBe(true);
    expect(firstTen.length).toBeGreaterThanOrEqual(6);
    expect([...ids].sort()).toEqual(allIds);
  });

  it("lọc chủ đề + tâm trạng: phủ đủ ba nhóm, không trùng", async () => {
    const { db } = setup(posts);
    const { ids, matched } = await collect(db, {
      count: posts.length,
      topic: "science",
      mood: "curious"
    });

    expect(matched).toBe(true);
    expect([...ids].sort()).toEqual(allIds);
  });

  it("bộ lọc không có bài riêng: matched = false nhưng vẫn có bài khác để xem", async () => {
    const { db } = setup(posts);
    const { ids, matched } = await collect(db, {
      count: 5,
      topic: "tips"
    });

    expect(matched).toBe(false);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("bộ lọc chỉ có bài của chính người xem thì cũng coi như không có bài", async () => {
    const own = posts.map((post) =>
      post.topic === "science" ? { ...post, authorId: AUTHOR } : post
    );
    const { db } = setup(own);
    const viewer: FeedViewer = { ...ANONYMOUS_VIEWER, userId: AUTHOR };
    const { matched } = await collect(db, { count: 3, topic: "science", viewer });

    expect(matched).toBe(false);
  });

  it("bài mới xen khoảng mỗi FRESH_EVERY thẻ, mỗi bài đúng một lần", async () => {
    const freshAt = 1_000 + posts.length - 15;
    const { db } = setup(posts);
    const viewer = viewerWith({ freshAt });
    const { ids } = await collect(db, { count: posts.length, viewer });
    const fresh = new Set(
      posts.filter((post) => post.publishedAt > freshAt).map((post) => post.id)
    );
    const positions = ids
      .map((id, index) => (fresh.has(id) ? index : -1))
      .filter((index) => index >= 0);
    const firstThirty = positions.filter((index) => index < 30).length;

    expect([...ids].sort()).toEqual(allIds);
    expect(positions).toHaveLength(fresh.size);
    expect(positions[0]).toBeGreaterThanOrEqual(FRESH_EVERY - 1);
    expect(firstThirty).toBeGreaterThanOrEqual(4);
    expect(firstThirty).toBeLessThanOrEqual(30 / FRESH_EVERY + 1);
    expect(ids.filter((id) => fresh.has(id))).toEqual(
      posts.filter((post) => fresh.has(post.id)).map((post) => post.id)
    );
  });

  it("quét nhiều vòng khi gần hết bài chưa xem, vẫn đủ trang trong giới hạn", async () => {
    const big = catalog(600, 5);
    const { db, seqs, counter } = setup(big);
    const ring = [...big].sort((a, b) => a.rankKey - b.rankKey);
    const keep = ring.slice(-4).map((post) => post.id);
    const viewer = viewerWith({
      seenIds: big.map((post) => post.id).filter((id) => !keep.includes(id)),
      seqs
    });

    counter.statements = 0;
    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 3,
      viewer,
      origin: () => 0
    });

    expect(page.items.map((item) => item.id)).toEqual(keep.slice(0, 3));
    expect(counter.statements).toBeLessThanOrEqual(12);
    expect(MAX_SCAN_ROWS).toBeGreaterThanOrEqual(big.length);
  });

  it("thẻ trả về đủ trường cho client, có format và số đếm", async () => {
    const { db, sqlite } = setup(posts.slice(0, 3));
    const first = posts[0]?.id ?? "p0001";

    sqlite
      .prepare(
        `INSERT INTO content_stats (content_id, like_count, save_count, share_count)
         VALUES (?, 12, 3, 7)`
      )
      .run(first);

    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 3,
      origin: () => 0
    });
    const item = page.items.find((entry) => entry.id === first) ?? page.items[0];

    expect(item).toMatchObject({ format: "text", status: "published" });
    expect(item?.topics.length).toBe(1);
    expect(item?.suitableMoods.length).toBe(1);
    expect(item).not.toHaveProperty("rankKey");
    expect(item).not.toHaveProperty("seq");
    expect(item?.likeCount).toBe(12);
    expect(item?.saveCount).toBe(3);
    expect(item?.shareCount).toBe(7);
    expect(item?.liked).toBeUndefined();
    expect(item?.saved).toBeUndefined();
  });

  it("feed gắn image / video / pollOptions từ bảng media và poll", async () => {
    const slice = posts.slice(0, 3);
    const { db, sqlite } = setup(slice);
    const [imageId, videoId, pollId] = slice.map((post) => post.id);

    sqlite.prepare(`UPDATE contents SET format = 'image' WHERE id = ?`).run(imageId);
    sqlite.prepare(`UPDATE contents SET format = 'video' WHERE id = ?`).run(videoId);
    sqlite.prepare(`UPDATE contents SET format = 'poll' WHERE id = ?`).run(pollId);

    sqlite
      .prepare(
        `INSERT INTO content_media (content_id, kind, url, alt, poster_url, width, height)
         VALUES (?, 'image', ?, 'Núi', NULL, 720, 900)`
      )
      .run(imageId, "https://example.com/mountain.jpg");

    sqlite
      .prepare(
        `INSERT INTO content_media (content_id, kind, url, alt, poster_url, width, height)
         VALUES (?, 'video', ?, 'Clip', ?, 1280, 720)`
      )
      .run(
        videoId,
        "https://example.com/clip.mp4",
        "https://example.com/poster.jpg"
      );

    sqlite
      .prepare(
        `INSERT INTO poll_options (content_id, option_id, label, sort_order)
         VALUES (?, 'o1', 'Êm', 0), (?, 'o2', 'Mệt', 1)`
      )
      .run(pollId, pollId);

    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 3,
      origin: () => 0
    });

    const byId = new Map(page.items.map((item) => [item.id, item]));

    expect(byId.get(imageId)).toMatchObject({
      format: "image",
      image: {
        url: "https://example.com/mountain.jpg",
        alt: "Núi",
        width: 720,
        height: 900
      }
    });
    expect(byId.get(videoId)).toMatchObject({
      format: "video",
      video: {
        url: "https://example.com/clip.mp4",
        poster: "https://example.com/poster.jpg",
        width: 1280,
        height: 720
      }
    });
    expect(byId.get(pollId)).toMatchObject({
      format: "poll",
      pollOptions: [
        { id: "o1", label: "Êm" },
        { id: "o2", label: "Mệt" }
      ]
    });
    expect(byId.get(pollId)).not.toHaveProperty("image");
  });

  it("có mã ẩn danh: gắn liked/saved vào thẻ trong cùng trang", async () => {
    const { db, sqlite } = setup(posts.slice(0, 5));
    const actor = "CcCcCcCcCcCcCcCcCcCcCc";
    const target = posts[0]?.id ?? "p0001";

    sqlite.prepare(`INSERT INTO actors (id) VALUES (?)`).run(actor);
    sqlite
      .prepare(
        `INSERT INTO content_reactions (content_id, actor_id, kind)
         VALUES (?, ?, 'like'), (?, ?, 'save')`
      )
      .run(target, actor, target, actor);

    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 5,
      viewer: {
        ...ANONYMOUS_VIEWER,
        key: `a:${actor}`,
        actorId: actor
      },
      origin: () => 0
    });
    const item = page.items.find((entry) => entry.id === target);

    expect(item?.liked).toBe(true);
    expect(item?.saved).toBe(true);
    expect(page.items.every((entry) => typeof entry.liked === "boolean")).toBe(
      true
    );
  });

  it("pageCursor: trang đầu là cursor xuất phát, trang sau là cursor yêu cầu", async () => {
    const { db } = setup(posts);
    const first = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 5,
      origin: () => 321_000
    });
    const start = decodeRingCursor(first.pageCursor);
    const next = decodeRingCursor(first.nextCursor ?? "");
    const second = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: next,
      limit: 5
    });

    expect(start).toMatchObject({ origin: 321_000, emitted: 0 });
    expect(start?.preferred.mode).toBe("start");
    expect(second.pageCursor).toBe(first.nextCursor);
  });

  it("mở lại từ pageCursor: gặp lại bài trong trang chưa kịp xem, bỏ bài đã xem", async () => {
    const { db, seqs } = setup(posts);
    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 5,
      viewer: viewerWith({ seqs }),
      origin: () => 600_000
    });
    const ids = page.items.map((item) => item.id);
    const viewer = viewerWith({
      seqs,
      seenIds: ids.slice(0, 2),
      positions: writePosition(new Map(), "all", "all", page.pageCursor)
    });
    const reopened = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 5,
      viewer,
      origin: () => 1
    });
    const again = reopened.items.map((item) => item.id);

    expect(again.some((id) => ids.slice(0, 2).includes(id))).toBe(false);
    expect(again).toEqual(expect.arrayContaining(ids.slice(2)));
  });

  it("pageCursor bỏ qua đoạn toàn bài đã xem ở đầu request", async () => {
    const big = catalog(300, 5);
    const { db, seqs } = setup(big);
    const ring = [...big].sort((a, b) => a.rankKey - b.rankKey);
    const seenIds = ring.slice(0, 200).map((post) => post.id);
    const viewer = viewerWith({ seenIds, seqs });
    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 3,
      viewer,
      origin: () => 0
    });
    const start = decodeRingCursor(page.pageCursor);
    const resumed = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: start,
      limit: 3,
      viewer
    });

    expect(start?.preferred.mode).toBe("after");
    expect(resumed.items.map((item) => item.id)).toEqual(
      page.items.map((item) => item.id)
    );
  });

  it("sau all-seen: pageCursor là đầu vòng mới, không phải chỗ cũ", async () => {
    const { db, seqs } = setup(posts);
    const origin = 1;
    const viewer = viewerWith({
      seenIds: posts.map((p) => p.id),
      seqs,
      positions: writePosition(
        new Map(),
        "all",
        "all",
        encodeRingCursor({
          ...startRingCursor({ topic: "all", mood: "all", origin, freshAt: 9_999_999 }),
          emitted: 60,
          preferred: { mode: "after", wrapped: false, rankKey: 900_000, id: "p0001" }
        })
      )
    });
    const page = await loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor: null,
      limit: 5,
      viewer,
      onAllSeen: async () => new Uint8Array(0)
    });
    const start = decodeRingCursor(page.pageCursor);

    expect(page.notice).toBe("all-seen");
    expect(page.items).toHaveLength(5);
    expect(start?.origin).toBe(origin);
    expect(start?.preferred.mode).toBe("start");
    expect(start?.emitted).toBe(0);
  });

  it("vị trí lưu lúc chưa có trạng thái (chưa có làn bài mới): bật làn bài mới, không mất bài", async () => {
    const { db, seqs } = setup(posts);
    const freshAt = 1_000 + posts.length - 15;
    const read = (cursor: RingCursor | null) =>
      loadPublicFeed(db, {
        topic: "all",
        mood: "all",
        cursor,
        limit: 5,
        origin: () => 450_000
      });
    const page1 = await read(null);
    const page2 = await read(decodeRingCursor(page1.nextCursor ?? ""));
    const seenToday = [...page1.items, ...page2.items].map((item) => item.id);

    expect(decodeRingCursor(page2.nextCursor ?? "")?.freshAt).toBeNull();

    const viewer = viewerWith({
      seqs,
      seenIds: seenToday,
      freshAt,
      positions: writePosition(new Map(), "all", "all", page2.nextCursor ?? "")
    });
    const start = chooseStartCursor(viewer, "all", "all");
    const { ids } = await collect(db, {
      count: posts.length - seenToday.length,
      viewer
    });
    const fresh = posts.filter((post) => post.publishedAt > freshAt).map((p) => p.id);

    expect(start.freshAt).toBe(freshAt);
    expect(start.fresh.mode).toBe("start");
    expect(start.preferred).toEqual(decodeRingCursor(page2.nextCursor ?? "")?.preferred);
    expect(unique(ids)).toBe(true);
    expect(ids.some((id) => seenToday.includes(id))).toBe(false);
    expect([...ids, ...seenToday].sort()).toEqual(allIds);
    expect(ids.slice(0, 10).some((id) => fresh.includes(id))).toBe(true);
  });

  it("từ chối cursor của bộ lọc khác", async () => {
    const { db } = setup(posts);
    const cursor = startRingCursor({
      topic: "science",
      mood: "all",
      origin: 1,
      freshAt: null
    });

    await expect(
      loadPublicFeed(db, { topic: "all", mood: "all", cursor, limit: 3 })
    ).rejects.toThrow();
  });
});

describe("chooseStartCursor", () => {
  const saved = (topic: TopicFilter, rankKey: number, favorites: ContentTopic[] = []) => {
    const cursor = startRingCursor({
      topic,
      mood: "all",
      origin: 10,
      freshAt: null,
      favorites
    });

    return encodeRingCursor({
      ...cursor,
      emitted: 4,
      preferred: { mode: "after", wrapped: false, rankKey, id: "p0001" }
    });
  };

  it("đi tiếp đúng cursor đã lưu của bộ lọc", () => {
    const positions = writePosition(new Map(), "all", "all", saved("all", 777));
    const cursor = chooseStartCursor(viewerWith({ positions }), "all", "all");

    expect(cursor.preferred).toMatchObject({ mode: "after", rankKey: 777 });
    expect(cursor.emitted).toBe(4);
  });

  it("chủ đề yêu thích đổi: bắt đầu lại tại chỗ đang đứng", () => {
    const positions = writePosition(new Map(), "all", "all", saved("all", 777));
    const viewer = viewerWith({ positions, favorites: ["nature"] });
    const cursor = chooseStartCursor(viewer, "all", "all");

    expect(cursor.favorites).toEqual(["nature"]);
    expect(cursor.origin).toBe(777);
    expect(cursor.preferred.mode).toBe("start");
  });

  it("bộ lọc chưa từng xem: đi từ chỗ đang đứng ở Dành cho bạn", () => {
    const positions = writePosition(new Map(), "all", "all", saved("all", 555));
    const cursor = chooseStartCursor(viewerWith({ positions }), "science", "all");

    expect(cursor.topic).toBe("science");
    expect(cursor.origin).toBe(555);
  });

  it("người mới hoặc vị trí hỏng: điểm ngẫu nhiên, mốc bài mới theo trạng thái", () => {
    const broken = writePosition(new Map(), "all", "all", "v6:broken");

    expect(chooseStartCursor(ANONYMOUS_VIEWER, "all", "all", () => 42)).toMatchObject({
      origin: 42,
      freshAt: null
    });
    expect(
      chooseStartCursor(viewerWith({ positions: broken, freshAt: 99 }), "all", "all", () => 43)
    ).toMatchObject({ origin: 43, freshAt: 99 });
  });
});

describe("luồng thật: xem, báo đã xem, hôm sau mở lại", () => {
  const ACTOR = "AbCdEfGhIjKlMnOpQrStUv";
  const COOKIE = `${ACTOR_COOKIE}=${ACTOR}`;
  const DAY = 86_400;
  const START = 10_000_000;
  const LIMIT = 5;

  function world(count: number) {
    const test = setup(catalog(count, 23));
    test.sqlite.prepare(`INSERT INTO actors (id) VALUES (?)`).run(ACTOR);
    return test;
  }

  async function open(db: D1Database, now: number, cursor: RingCursor | null, origin: number) {
    const viewer = await readFeedViewer(db, COOKIE, now);

    return loadPublicFeed(db, {
      topic: "all",
      mood: "all",
      cursor,
      limit: LIMIT,
      viewer,
      onAllSeen: () => resetViewerLoop(db, viewer, now),
      origin: () => origin
    });
  }

  async function report(db: D1Database, now: number, ids: string[], pageCursor: string) {
    if (ids.length === 0) return;

    const viewer = await readFeedViewer(db, COOKIE, now);

    await recordSeen(db, {
      key: `a:${ACTOR}`,
      userId: null,
      actorId: ACTOR,
      state: viewer.state,
      report: { ids, cursor: decodeRingCursor(pageCursor) },
      now
    });
  }

  /** Mot phien: luot `pages` trang, trang cuoi chi kip xem `lastSeen` the. */
  async function session(
    db: D1Database,
    now: number,
    pages: number,
    lastSeen: number,
    origin: number
  ) {
    const shown: Array<{ ids: string[]; watched: string[]; notice: string | null }> = [];
    let cursor: RingCursor | null = null;

    for (let index = 0; index < pages; index++) {
      const page = await open(db, now, cursor, origin);
      const ids = page.items.map((item) => item.id);
      const watched = index === pages - 1 ? ids.slice(0, lastSeen) : ids;

      shown.push({ ids, watched, notice: page.notice });
      await report(db, now, watched, page.pageCursor);

      if (!page.nextCursor) break;
      cursor = decodeRingCursor(page.nextCursor);
    }

    return {
      shown,
      pageItems: shown.map((page) => page.ids),
      served: shown.flatMap((page) => page.ids),
      seen: shown.flatMap((page) => page.watched),
      notices: shown.map((page) => page.notice)
    };
  }

  it("nhiều ngày: không gặp lại bài đã xem cho tới khi xem hết kho", async () => {
    const { db } = world(60);
    const seenEver = new Set<string>();
    let lastPage: string[] = [];
    let allSeenDay = -1;

    for (let day = 0; day < 40 && allSeenDay < 0; day++) {
      // Moi lan mo app mot diem ngau nhien khac; trang thai da luu phai thang.
      const today = await session(db, START + day * DAY, 2, 3, 1 + day * 37_003);

      if (day > 0 && lastPage.length === LIMIT && !today.notices[0]) {
        // Hai the chua kip xem cua trang cuoi hom truoc quay lai ngay dau phien.
        const unseen = lastPage.slice(3).filter((id) => !seenEver.has(id));
        expect(today.pageItems[0]).toEqual(expect.arrayContaining(unseen));
      }

      for (const page of today.shown) {
        if (page.notice === "all-seen") {
          expect(seenEver.size).toBe(60);
          allSeenDay = day;
          break;
        }

        for (const id of page.ids) expect(seenEver.has(id)).toBe(false);
        for (const id of page.watched) seenEver.add(id);
      }

      lastPage = today.pageItems.at(-1) ?? [];
    }

    // Moi ngay xem them 8 bai moi: ngay thu 8 (chi so 7) xem not 4 bai cuoi roi het kho.
    expect(allSeenDay).toBe(7);
  });

  it("bài đăng hôm sau hiện sớm trong phiên mới, đúng một lần", async () => {
    const { db, sqlite } = world(60);

    await session(db, START, 2, 5, 123_456);

    sqlite
      .prepare(
        `INSERT INTO contents (id, slug, kind, status, category, title, theme, published_at, rank_key)
         VALUES ('new1', 'new1', 'quote', 'published', 't', 't', 'peace', ?, 5)`
      )
      .run(START + DAY / 2);

    const tomorrow = await session(db, START + DAY, 4, 5, 999);
    const hits = tomorrow.served.filter((id) => id === "new1");
    const after = await readFeedViewer(db, COOKIE, START + DAY);

    expect(hits).toHaveLength(1);
    expect(tomorrow.served.indexOf("new1")).toBeLessThan(2 * FRESH_EVERY);
    expect(after.state?.freshAt).toBe(START + DAY / 2);

    const dayAfter = await session(db, START + 2 * DAY, 4, 5, 5);
    expect(dayAfter.served).not.toContain("new1");
  });

  it("xem hết kho: báo all-seen một lần, vòng mới không có bài đã thích", async () => {
    const { db, sqlite } = world(12);
    const first = await session(db, START, 3, LIMIT, 50_000);

    sqlite
      .prepare(`INSERT INTO content_reactions (content_id, actor_id, kind) VALUES ('p0003', ?, 'like')`)
      .run(ACTOR);

    const second = await session(db, START + DAY, 3, LIMIT, 70_000);
    const notices = [...first.notices, ...second.notices].filter(Boolean);
    const rest = catalog(12, 23).map((p) => p.id).filter((id) => id !== "p0003");

    expect(new Set(first.seen).size).toBe(12);
    expect(unique(first.served)).toBe(true);
    expect(notices).toEqual(["all-seen"]);
    expect(second.notices[0]).toBe("all-seen");
    expect([...second.served].sort()).toEqual(rest.sort());
  });
});

describe("kế hoạch truy vấn", () => {
  function plan(sqlite: DatabaseSync, sql: string, binds: unknown[]): string {
    const rows = sqlite
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...(binds as Array<string | number | null>)) as Array<{ detail: string }>;
    return rows.map((row) => row.detail).join(" | ");
  }

  it("nhóm trên vòng đi theo idx_contents_public_rank, không sắp xếp tạm", () => {
    const { sqlite } = setup(catalog(300));

    for (const topic of ["all", "science"] as const) {
      const cursor = startRingCursor({ topic, mood: "all", origin: 5, freshAt: 100 });

      for (const lane of ["preferred", "surprise"] as const) {
        const query = ringLaneQuery(lane, cursor, AUTHOR, 10);
        if (!query) continue;

        const detail = plan(sqlite, query.sql, query.binds);

        expect(detail).toContain("idx_contents_public_rank");
        expect(detail).not.toContain("TEMP B-TREE");
      }
    }
  });

  it("làn bài mới đi theo idx_contents_public_feed, không sắp xếp tạm", () => {
    const { sqlite } = setup(catalog(300));
    const cursor = startRingCursor({ topic: "all", mood: "all", origin: 5, freshAt: 100 });
    const query = freshLaneQuery(cursor, null, 10);

    expect(query).not.toBeNull();

    const detail = plan(sqlite, query?.sql ?? "", query?.binds ?? []);

    expect(detail).toContain("idx_contents_public_feed");
    expect(detail).not.toContain("TEMP B-TREE");
  });
});
