import type { ContentDraftInput } from "./content-draft";
import { parseContentDraft } from "./content-draft";
import type { AdminCatalogItem } from "./d1-admin-content";

/** Format chap nhan trong nhap hang loat (giai doan 1). */
export const IMPORT_FORMATS = ["text", "quote", "prompt"] as const;

export type ImportFormat = (typeof IMPORT_FORMATS)[number];

/** Nhan VI dong bo AdminStudio — hien trong Excel dropdown. */
export const IMPORT_FORMAT_OPTIONS: ReadonlyArray<{
  value: ImportFormat;
  label: string;
}> = [
  { value: "text", label: "Bài viết" },
  { value: "quote", label: "Câu nói" },
  { value: "prompt", label: "Câu hỏi" }
];

export const IMPORT_MAX_ROWS = 100;

/** Ten cot Excel (hang 1) — ho tro ca EN va VI. */
export const IMPORT_HEADERS = [
  "format",
  "title",
  "topics",
  "moods",
  "sourceLabel",
  "sourceUrl",
  "body"
] as const;

export type ImportHeader = (typeof IMPORT_HEADERS)[number];

const HEADER_ALIASES: Record<string, ImportHeader> = {
  format: "format",
  "dinh dang": "format",
  "định dạng": "format",
  title: "title",
  "tieu de": "title",
  "tiêu đề": "title",
  topics: "topics",
  "chu de": "topics",
  "chủ đề": "topics",
  moods: "moods",
  "tam trang": "moods",
  "tâm trạng": "moods",
  sourcelabel: "sourceLabel",
  nguon: "sourceLabel",
  nguồn: "sourceLabel",
  sourceurl: "sourceUrl",
  "link nguon": "sourceUrl",
  "link nguồn": "sourceUrl",
  body: "body",
  "noi dung": "body",
  "nội dung": "body",
  "noi dung dai": "body",
  "nội dung dài": "body"
};

export const IMPORT_HEADER_LABELS: Record<ImportHeader, string> = {
  format: "Định dạng",
  title: "Tiêu đề",
  topics: "Chủ đề",
  moods: "Tâm trạng",
  sourceLabel: "Nguồn",
  sourceUrl: "Link nguồn",
  body: "Nội dung dài"
};

export interface ImportRowResult {
  row: number;
  ok: boolean;
  id?: string;
  title?: string;
  error?: string;
}

export interface ImportCatalog {
  topics: AdminCatalogItem[];
  moods: AdminCatalogItem[];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

function normKey(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function splitParts(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[|,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveFormat(raw: string): ImportFormat | null {
  const key = normKey(raw);
  if (!key) return null;

  for (const option of IMPORT_FORMAT_OPTIONS) {
    if (key === option.value || key === normKey(option.label)) {
      return option.value;
    }
  }

  return null;
}

/** Tim slug theo label (VI) hoac slug; uu tien khop dung. */
function resolveCatalogToken(
  raw: string,
  items: AdminCatalogItem[]
): string | null {
  const key = normKey(raw);
  if (!key) return null;

  const bySlug = items.find((item) => normKey(item.slug) === key);
  if (bySlug) return bySlug.slug;

  const byLabel = items.find((item) => normKey(item.label) === key);
  if (byLabel) return byLabel.slug;

  return null;
}

function resolveCatalogList(
  raw: string,
  items: AdminCatalogItem[],
  field: "topics" | "moods"
): { ok: true; values: string[] } | { ok: false; error: string } {
  const parts = splitParts(raw);
  if (parts.length === 0) {
    return field === "topics"
      ? { ok: false, error: "Hãy chọn ít nhất một chủ đề." }
      : { ok: true, values: [] };
  }

  const values: string[] = [];
  for (const part of parts) {
    const slug = resolveCatalogToken(part, items);
    if (!slug) {
      return {
        ok: false,
        error:
          field === "topics"
            ? `Chủ đề không khớp dữ liệu: “${part}”.`
            : `Tâm trạng không khớp dữ liệu: “${part}”.`
      };
    }
    if (!values.includes(slug)) values.push(slug);
  }

  return { ok: true, values };
}

/**
 * Map 1 dong Excel → draft.
 * Chap nhan nhan TIENG VIET (dropdown) hoac slug/ma EN.
 */
export function draftFromImportRow(
  raw: Record<string, unknown>,
  catalog: ImportCatalog
):
  | { ok: true; value: ContentDraftInput }
  | { ok: false; error: string } {
  const format = resolveFormat(cellText(raw.format));
  if (!format) {
    return {
      ok: false,
      error: `Định dạng phải là: ${IMPORT_FORMAT_OPTIONS.map((item) => item.label).join(", ")}.`
    };
  }

  const topics = resolveCatalogList(
    cellText(raw.topics),
    catalog.topics,
    "topics"
  );
  if (!topics.ok) return topics;

  const moods = resolveCatalogList(
    cellText(raw.moods),
    catalog.moods,
    "moods"
  );
  if (!moods.ok) return moods;

  return parseContentDraft({
    format,
    title: cellText(raw.title),
    topics: topics.values,
    moods: moods.values,
    sourceLabel: cellText(raw.sourceLabel),
    sourceUrl: cellText(raw.sourceUrl),
    body: cellText(raw.body),
    collectionIds: []
  });
}

export function normalizeHeader(value: unknown): string {
  return cellText(value)
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Map header row → index cot. */
export function mapHeaderIndexes(
  headerCells: unknown[]
): Map<ImportHeader, number> | null {
  const map = new Map<ImportHeader, number>();

  headerCells.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    const mapped = HEADER_ALIASES[key];
    if (mapped) map.set(mapped, index);
  });

  if (!map.has("format") || !map.has("title") || !map.has("topics")) {
    return null;
  }

  return map;
}

export function rowRecord(
  cells: unknown[],
  indexes: Map<ImportHeader, number>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of IMPORT_HEADERS) {
    const at = indexes.get(name);
    out[name] = at === undefined ? "" : cellText(cells[at]);
  }
  return out;
}
