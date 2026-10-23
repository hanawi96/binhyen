
/**
 * Loai noi dung.
 * Dung cho viec hien thi, quan ly va goi y.
 */
export const contentKinds = [
  "quote",
  "story",
  "fact",
  "insight",
  "psychology",
  "cute",
  "tip"
] as const;

export type ContentKind = (typeof contentKinds)[number];

/**
 * Chu de nguoi dung quan tam.
 */
export const contentTopics = [
  "peace",
  "stories",
  "science",
  "nature",
  "psychology",
  "perspective",
  "cute",
  "tips"
] as const;

export type ContentTopic = (typeof contentTopics)[number];

/**
 * Tam trang hien tai cua nguoi dung.
 */
export const contentMoods = [
  "calm",
  "tired",
  "stressed",
  "sad",
  "happy",
  "curious"
] as const;

export type ContentMood = (typeof contentMoods)[number];

/**
 * Mau giao dien cua the.
 */
export const contentThemes = [
  "peace",
  "discovery",
  "story",
  "nature",
  "psychology",
  "cute"
] as const;

export type ContentTheme = (typeof contentThemes)[number];

export function isContentKind(value: string): value is ContentKind {
  return (contentKinds as readonly string[]).includes(value);
}

export function isContentTheme(value: string): value is ContentTheme {
  return (contentThemes as readonly string[]).includes(value);
}

/**
 * Trang thai xuat ban.
 */
export type ContentStatus =
  | "draft"
  | "published"
  | "archived";

/**
 * Phan noi dung dai tuy chon.
 * Body su dung Markdown.
 */
export interface ContentArticle {
  bodyMarkdown: string;
  readingMinutes: number;
}

/**
 * Nguon tham khao.
 */
export interface ContentSource {
  label: string;
  url: string;
}

/**
 * Cau truc thong nhat cho moi noi dung.
 */
export interface ContentItem {
  id: string;
  slug: string;

  kind: ContentKind;
  status: ContentStatus;

  category: string;
  title: string;
  description: string;
  tag: string;

  theme: ContentTheme;

  topics: ContentTopic[];
  suitableMoods: ContentMood[];

  article?: ContentArticle;
  source?: ContentSource;
}
