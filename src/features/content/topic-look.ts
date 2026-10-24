import type { ContentTheme, ContentTopic } from "./content.types";

/** Ten chu de hien thi tren the / bo loc (khac category nhom mau). */
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

/** Nhom hien thi va mau the lay theo chu de (khong chon tay tren form). */
export const topicLook: Record<
  ContentTopic,
  { theme: ContentTheme; category: string }
> = {
  peace: { theme: "peace", category: "Chữa lành & bình yên" },
  stories: { theme: "story", category: "Góc nhìn cuộc sống" },
  science: { theme: "discovery", category: "Kiến thức kỳ thú" },
  nature: { theme: "nature", category: "Thiên nhiên kỳ thú" },
  psychology: { theme: "psychology", category: "Tâm lý học dễ hiểu" },
  perspective: { theme: "story", category: "Góc nhìn cuộc sống" },
  cute: { theme: "cute", category: "Những điều dễ thương" },
  tips: { theme: "discovery", category: "Kiến thức kỳ thú" }
};

export function lookFromTopic(topic: ContentTopic): {
  theme: ContentTheme;
  category: string;
} {
  return topicLook[topic];
}

/** Chu de dau tien tren the; thieu thi de chuoi rong. */
export function primaryTopicLabel(
  topics: readonly string[] | undefined
): string {
  const first = topics?.[0];
  if (!first) return "";
  return (
    topicLabels[first as ContentTopic] ??
    first
  );
}
