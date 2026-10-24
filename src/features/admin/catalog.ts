import { normalizeSlug } from "../content/content-lifecycle";
import { contentMoods, contentTopics } from "../content/content.types";

const LABEL_LIMIT = 48;
const SLUG_MIN = 2;
const SLUG_MAX = 32;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CatalogUpdate {
  kind: "topic" | "mood";
  slug: string;
  label: string;
  sortOrder: number;
}

export interface CatalogCreate {
  kind: "topic" | "mood";
  label: string;
  slug: string;
}

export function isCatalogSlug(value: string): boolean {
  return (
    value.length >= SLUG_MIN &&
    value.length <= SLUG_MAX &&
    SLUG_PATTERN.test(value)
  );
}

/** Sinh slug từ tên; rỗng thì trả null. */
export function catalogSlugFromLabel(label: string): string | null {
  try {
    const slug = normalizeSlug(label).slice(0, SLUG_MAX);
    return isCatalogSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

export function parseCatalogUpdate(
  value: unknown
): { ok: true; value: CatalogUpdate } | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Yêu cầu không đọc được." };
  }

  const source = value as Record<string, unknown>;
  const kind =
    source.kind === "mood" ? "mood" : source.kind === "topic" ? "topic" : null;

  if (!kind) {
    return { ok: false, error: "Hãy chọn chủ đề hoặc tâm trạng." };
  }

  const allowed = kind === "topic" ? contentTopics : contentMoods;
  const slug = typeof source.slug === "string" ? source.slug : "";

  // Cho phép sửa mục preset HOẶC slug đã tạo (đúng pattern).
  if (
    !(allowed as readonly string[]).includes(slug) &&
    !isCatalogSlug(slug)
  ) {
    return { ok: false, error: "Mã này không hợp lệ." };
  }

  const label = typeof source.label === "string" ? source.label.trim() : "";

  if (!label || label.length > LABEL_LIMIT) {
    return {
      ok: false,
      error: `Tên hiển thị cần từ 1 đến ${LABEL_LIMIT} ký tự.`
    };
  }

  const sortOrder = source.sortOrder;

  if (
    typeof sortOrder !== "number" ||
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 999
  ) {
    return { ok: false, error: "Thứ tự phải là số nguyên từ 0 đến 999." };
  }

  return { ok: true, value: { kind, slug, label, sortOrder } };
}

export function parseCatalogCreate(
  value: unknown
): { ok: true; value: CatalogCreate } | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Yêu cầu không đọc được." };
  }

  const source = value as Record<string, unknown>;
  const kind =
    source.kind === "mood" ? "mood" : source.kind === "topic" ? "topic" : null;

  if (!kind) {
    return { ok: false, error: "Hãy chọn Chủ đề hoặc Tâm trạng." };
  }

  const label = typeof source.label === "string" ? source.label.trim() : "";

  if (!label || label.length > LABEL_LIMIT) {
    return {
      ok: false,
      error: `Tên hiển thị cần từ 1 đến ${LABEL_LIMIT} ký tự.`
    };
  }

  let slug =
    typeof source.slug === "string" && source.slug.trim()
      ? source.slug.trim().toLowerCase()
      : catalogSlugFromLabel(label);

  if (!slug || !isCatalogSlug(slug)) {
    return {
      ok: false,
      error: "Không tạo được mã từ tên. Thử tên có chữ hoặc số."
    };
  }

  return { ok: true, value: { kind, label, slug } };
}
