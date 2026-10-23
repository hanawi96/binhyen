import { contentMoods, contentTopics } from "../content/content.types";

const LABEL_LIMIT = 48;

export interface CatalogUpdate {
  kind: "topic" | "mood";
  slug: string;
  label: string;
  sortOrder: number;
}

export function parseCatalogUpdate(
  value: unknown
): { ok: true; value: CatalogUpdate } | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Yêu cầu không đọc được." };
  }

  const source = value as Record<string, unknown>;
  const kind = source.kind === "mood" ? "mood" : source.kind === "topic" ? "topic" : null;

  if (!kind) {
    return { ok: false, error: "Hãy chọn chủ đề hoặc tâm trạng." };
  }

  const allowed = kind === "topic" ? contentTopics : contentMoods;
  const slug = typeof source.slug === "string" ? source.slug : "";

  if (!(allowed as readonly string[]).includes(slug)) {
    return { ok: false, error: "Mã này không thuộc danh mục đang dùng." };
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
