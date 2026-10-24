import type { ContentDraftInput } from "../admin/content-draft";
import { isContentTopic, type ContentTopic } from "../content/content.types";
import { lookFromTopic } from "../content/topic-look";

export const MAX_POST_TOPICS = 3;
/** Ban nhap chua dang toi da cua mot nguoi, chan spam. */
export const MAX_OPEN_DRAFTS = 30;

const LIMITS = { title: 280, body: 8000 } as const;

function text(value: unknown, limit: number): string | null {
  if (value === undefined) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length <= limit ? trimmed : null;
}

function topicsOf(value: unknown): ContentTopic[] | null {
  if (!Array.isArray(value)) return null;

  const chosen: ContentTopic[] = [];

  for (const item of value) {
    if (typeof item !== "string" || !isContentTopic(item)) return null;
    if (!chosen.includes(item)) chosen.push(item);
  }

  return chosen.length >= 1 && chosen.length <= MAX_POST_TOPICS
    ? chosen
    : null;
}

export function parsePostDraft(
  input: unknown
): { ok: true; value: ContentDraftInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Yêu cầu không đọc được." };
  }

  const source = input as Record<string, unknown>;
  const title = text(source.title, LIMITS.title);
  const body = text(source.body, LIMITS.body);
  const topics = topicsOf(source.topics);

  if (title === null || body === null) {
    return { ok: false, error: "Bài quá dài." };
  }

  if (!title) return { ok: false, error: "Hãy viết câu chữ chính." };

  if (!topics || !topics[0]) {
    return {
      ok: false,
      error: `Hãy chọn từ 1 đến ${MAX_POST_TOPICS} chủ đề.`
    };
  }

  return {
    ok: true,
    value: {
      title,
      description: "",
      body,
      topics,
      moods: [],
      format: "text",
      kind: "story",
      tag: "",
      sourceLabel: "",
      sourceUrl: "",
      imageUrl: "",
      imageAlt: "",
      imageWidth: null,
      imageHeight: null,
      posterUrl: "",
      pollOptions: [],
      ...lookFromTopic(topics[0])
    }
  };
}
