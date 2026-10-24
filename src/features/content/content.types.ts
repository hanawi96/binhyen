
/**
 * Dinh dang hien thi tren the (khac voi kind / chu de).
 * Hien chi viet 'text'; image / video / poll mo dan.
 */
export const contentFormats = [
  "text",
  "image",
  "video",
  "poll"
] as const;

export type ContentFormat = (typeof contentFormats)[number];

/**
 * Loai noi dung (du lieu cu / goi y).
 * Form bien tap khong chon tay; bai moi gan 'story'.
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

export function isContentFormat(value: string): value is ContentFormat {
  return (contentFormats as readonly string[]).includes(value);
}

export function isContentKind(value: string): value is ContentKind {
  return (contentKinds as readonly string[]).includes(value);
}

export function isContentTheme(value: string): value is ContentTheme {
  return (contentThemes as readonly string[]).includes(value);
}

export function isContentTopic(value: string): value is ContentTopic {
  return (contentTopics as readonly string[]).includes(value);
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
 * Anh kem the (format image). Embed trong feed — khong fetch them.
 */
export interface ContentImage {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
}

/**
 * Video kem the (format video). Embed meta trong feed; file chi tai khi phat.
 */
export interface ContentVideo {
  url: string;
  alt: string;
  poster: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Cau truc thong nhat cho moi noi dung.
 */
export interface ContentItem {
  id: string;
  slug: string;

  format: ContentFormat;
  kind: ContentKind;
  status: ContentStatus;

  category: string;
  title: string;
  description: string;
  tag: string;

  theme: ContentTheme;

  topics: ContentTopic[];
  suitableMoods: ContentMood[];

  /**
   * Nhan chu de dau (tu bang topics.label) — dung hien tren the.
   * Thieu thi UI co the suy tu topics[0].
   */
  topicLabel?: string;

  /** Co body dai trong content_details — bat nut Doc them. */
  hasArticle?: boolean;

  /** So dem cong khai tu content_stats — gui kem feed de rail khong flash 0. */
  likeCount?: number;
  saveCount?: number;
  shareCount?: number;
  /** Trang thai cua ma an danh / tai khoan dang xem; chi co khi biet actor. */
  liked?: boolean;
  saved?: boolean;

  article?: ContentArticle;
  source?: ContentSource;
  /** Co khi format = image va da gan media. */
  image?: ContentImage;
  /** Co khi format = video va da gan media. */
  video?: ContentVideo;
}
