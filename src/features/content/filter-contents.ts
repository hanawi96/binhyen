
import {
  contentMoods,
  contentTopics,
  type ContentItem,
  type ContentMood,
  type ContentTopic
} from "./content.types";

export type TopicFilter = ContentTopic | "all";
export type MoodFilter = ContentMood | "all";

function isListed(
  values: readonly string[],
  value: string
): boolean {
  return values.includes(value);
}

export function isTopicFilter(
  value: string
): value is TopicFilter {
  return value === "all" || isListed(contentTopics, value);
}

export function isMoodFilter(
  value: string
): value is MoodFilter {
  return value === "all" || isListed(contentMoods, value);
}

/**
 * Loc noi dung theo chu de va tam trang.
 *
 * "all" co nghia la khong ap dung dieu kien do.
 * Chi hien thi noi dung da xuat ban.
 *
 * Ham nay khong thay doi mang du lieu goc.
 */
export function filterContents(
  items: readonly ContentItem[],
  topic: TopicFilter,
  mood: MoodFilter
): ContentItem[] {
  return items.filter((item) => {
    if (item.status !== "published") {
      return false;
    }

    const matchTopic =
      topic === "all" || item.topics.includes(topic);

    const matchMood =
      mood === "all" || item.suitableMoods.includes(mood);

    return matchTopic && matchMood;
  });
}
