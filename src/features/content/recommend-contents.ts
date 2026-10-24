
import type { ContentItem } from "./content.types";
import type {
  TopicFilter,
  MoodFilter
} from "./filter-contents";

export type FeedBucket = "preferred" | "related" | "surprise";

export const FEED_MIX_PATTERN: readonly FeedBucket[] = [
  "preferred",
  "preferred",
  "related",
  "preferred",
  "surprise",
  "preferred",
  "preferred",
  "related",
  "preferred",
  "preferred"
];

type Bucket = FeedBucket;

const PATTERN = FEED_MIX_PATTERN;

/**
 * Tao gia tri xao tron on dinh theo ID.
 * Khong thay doi ngau nhien moi lan Svelte render.
 */
function stableNoise(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967296;
}

/**
 * Cham diem mot ung vien.
 * Uu tien do phu hop, sau do can bang su da dang.
 */
function scoreCandidate(
  item: ContentItem,
  previous: ContentItem | undefined,
  topic: TopicFilter,
  mood: MoodFilter
): number {
  let score = stableNoise(
    `${topic}:${mood}:${item.id}`
  ) * 10;

  if (topic !== "all" && item.topics.includes(topic)) {
    score += 40;
  }

  if (
    mood !== "all" &&
    item.suitableMoods.includes(mood)
  ) {
    score += 35;
  }

  if (previous) {
    // Tránh hai thẻ liền cùng chủ đề đầu.
    if (previous.topics[0] && previous.topics[0] === item.topics[0]) {
      score -= 15;
    }

    // Tránh lặp lại cùng loại nội dung.
    if (previous.kind === item.kind) {
      score -= 10;
    }
  }

  return score;
}

/**
 * Lay ung vien tot nhat tu mot nhom.
 * Phan tu duoc lay ra khoi nhom de khong lap ID.
 */
function takeBest(
  pool: ContentItem[],
  previous: ContentItem | undefined,
  topic: TopicFilter,
  mood: MoodFilter
): ContentItem | undefined {
  if (pool.length === 0) return undefined;

  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < pool.length; i++) {
    const score = scoreCandidate(
      pool[i],
      previous,
      topic,
      mood
    );

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return pool.splice(bestIndex, 1)[0];
}

/**
 * De xuat noi dung theo chu de va tam trang.
 *
 * - Uu tien noi dung phu hop ca hai dieu kien.
 * - Xen ke noi dung lien quan va bat ngo.
 * - Giam lap loai the va mau sac lien tiep.
 * - Khong lap ID trong danh sach ket qua.
 * - Chi lay noi dung da xuat ban.
 *
 * Dau vao sau nay nen la tap ung vien nho
 * da duoc backend chuan bi.
 */
export function recommendContents(
  items: readonly ContentItem[],
  topic: TopicFilter,
  mood: MoodFilter,
  limit = 12
): ContentItem[] {
  const pools: Record<Bucket, ContentItem[]> = {
    preferred: [],
    related: [],
    surprise: []
  };

  const seenIds = new Set<string>();

  const hasTopic = topic !== "all";
  const hasMood = mood !== "all";

  for (const item of items) {
    if (item.status !== "published") continue;
    if (seenIds.has(item.id)) continue;

    seenIds.add(item.id);

    const topicMatch =
      hasTopic && item.topics.includes(topic);

    const moodMatch =
      hasMood && item.suitableMoods.includes(mood);

    const matchesAll =
      (!hasTopic || topicMatch) &&
      (!hasMood || moodMatch);

    if (matchesAll) {
      pools.preferred.push(item);
    } else if (topicMatch || moodMatch) {
      pools.related.push(item);
    } else {
      pools.surprise.push(item);
    }
  }

  const result: ContentItem[] = [];

  const total = Math.min(
    Math.max(0, Math.floor(limit)),
    seenIds.size
  );

  while (result.length < total) {
    const wanted = PATTERN[result.length % PATTERN.length];

    // Neu nhom mong muon het bai,
    // chuyen sang nhom khac.
    const order: Bucket[] = [
      wanted,
      "preferred",
      "related",
      "surprise"
    ];

    const tried = new Set<Bucket>();
    let picked: ContentItem | undefined;

    for (const bucket of order) {
      if (tried.has(bucket)) continue;

      tried.add(bucket);

      picked = takeBest(
        pools[bucket],
        result[result.length - 1],
        topic,
        mood
      );

      if (picked) break;
    }

    if (!picked) break;

    result.push(picked);
  }

  return result;
}
