import type { ContentStatus } from "./content.types";

/**
 * Ba trang thai da khoa trong migration 0001.
 * Khong them trang thai review.
 */
const transitions: Record<ContentStatus, readonly ContentStatus[]> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: []
};

export interface ContentTransition {
  status: ContentStatus;
  publishedAt: number | null;
}

export function canTransitionContent(
  from: ContentStatus,
  to: ContentStatus
): boolean {
  return transitions[from].includes(to);
}

/**
 * Nhap sang xuat ban, co the gỡ về nhap, roi luu tru.
 * Gỡ xuất bản giữ publishedAt để lần đăng lại không đổi ngày cũ.
 * Bai da luu tru khong tu quay lai feed.
 */
export function transitionContent(
  from: ContentStatus,
  to: ContentStatus,
  publishedAt: number | null,
  now: number
): ContentTransition {
  if (!canTransitionContent(from, to)) {
    throw new Error(
      `Cannot change content from ${from} to ${to}`
    );
  }

  if (to === "published") {
    return {
      status: to,
      publishedAt: publishedAt ?? now
    };
  }

  return {
    status: to,
    publishedAt
  };
}

/**
 * Slug on dinh tu tieu de tieng Viet.
 * Ham nay khong do do tuong dong noi dung.
 */
export function normalizeSlug(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Slug is empty");
  }

  return slug;
}

export function normalizeContentText(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dau van chinh xac cho normalized_hash.
 * Khong phai kiem tra noi dung gan giong.
 */
export async function contentFingerprint(
  parts: readonly string[]
): Promise<string> {
  const text = parts
    .map((part) => normalizeContentText(part))
    .filter((part) => part.length > 0)
    .join("\n");

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
