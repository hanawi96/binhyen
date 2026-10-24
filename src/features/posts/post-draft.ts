import type { ContentDraftInput } from "../admin/content-draft";
import {
  isContentTopic,
  type ContentTheme,
  type ContentTopic
} from "../content/content.types";

export const MAX_POST_TOPICS = 3;
/** Ban nhap chua dang toi da cua mot nguoi, chan spam. */
export const MAX_OPEN_DRAFTS = 30;

const LIMITS = { title: 280, description: 400, body: 8000 } as const;

/** Nhom hien thi va mau the lay theo chu de dau tien. */
const LOOK: Record<ContentTopic, { theme: ContentTheme; category: string }> = {
  peace: { theme: "peace", category: "Chữa lành & bình yên" },
  stories: { theme: "story", category: "Góc nhìn cuộc sống" },
  science: { theme: "discovery", category: "Kiến thức kỳ thú" },
  nature: { theme: "nature", category: "Thiên nhiên kỳ thú" },
  psychology: { theme: "psychology", category: "Tâm lý học dễ hiểu" },
  perspective: { theme: "story", category: "Góc nhìn cuộc sống" },
  cute: { theme: "cute", category: "Những điều dễ thương" },
  tips: { theme: "discovery", category: "Kiến thức kỳ thú" }
};

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
  const description = text(source.description, LIMITS.description);
  const body = text(source.body, LIMITS.body);
  const topics = topicsOf(source.topics);

  if (title === null || description === null || body === null) {
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
      description,
      body,
      topics,
      moods: [],
      kind: "story",
      tag: "",
      sourceLabel: "",
      sourceUrl: "",
      ...LOOK[topics[0]]
    }
  };
}
