import { isContentTopic, type ContentTopic } from "./content.types";

/** Tên chủ đề hiển thị trên thẻ / bộ lọc (preset). */
export const topicLabels: Record<ContentTopic, string> = {
  peace: "Bình yên",
  stories: "Câu chuyện",
  science: "Khoa học",
  nature: "Thiên nhiên",
  psychology: "Tâm lý",
  perspective: "Góc nhìn",
  cute: "Dễ thương",
  tips: "Mẹo thú vị"
};

/** Nhóm chữ (category) theo chủ đề preset — không gắn màu thẻ. */
export const topicCategories: Record<ContentTopic, string> = {
  peace: "Chữa lành & bình yên",
  stories: "Góc nhìn cuộc sống",
  science: "Kiến thức kỳ thú",
  nature: "Thiên nhiên kỳ thú",
  psychology: "Tâm lý học dễ hiểu",
  perspective: "Góc nhìn cuộc sống",
  cute: "Những điều dễ thương",
  tips: "Kiến thức kỳ thú"
};

/** Theme cột DB cố định — nền feed dùng atmosphere preset, không theo chủ đề. */
export const DEFAULT_CONTENT_THEME = "peace" as const;

export function categoryFromTopic(topic: ContentTopic): string {
  return topicCategories[topic];
}

/** Category cho slug bất kỳ (preset hoặc mới từ catalog). */
export function categoryForTopicSlug(slug: string): string {
  return isContentTopic(slug) ? topicCategories[slug] : "Khác";
}

/** Chủ đề đầu tiên trên thẻ; thiếu thì chuỗi rỗng. */
export function primaryTopicLabel(
  topics: readonly string[] | undefined
): string {
  const first = topics?.[0];
  if (!first) return "";
  return topicLabels[first as ContentTopic] ?? first;
}
