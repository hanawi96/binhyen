import { describe, expect, it } from "vitest";

import type { ContentItem } from "../content/content.types";
import {
  prependFocusCard,
  readFocusContentId
} from "./load-published-card";

function item(id: string): ContentItem {
  return {
    id,
    slug: id,
    format: "text",
    kind: "story",
    status: "published",
    category: "Bình yên",
    title: id,
    description: "",
    tag: "",
    theme: "peace",
    topics: ["peace"],
    suitableMoods: ["calm"]
  };
}

describe("readFocusContentId", () => {
  it("chỉ nhận id hợp lệ", () => {
    expect(readFocusContentId("c0123456789abcdef")).toBe("c0123456789abcdef");
    expect(readFocusContentId("../x")).toBeNull();
    expect(readFocusContentId("")).toBeNull();
    expect(readFocusContentId(null)).toBeNull();
  });
});

describe("prependFocusCard", () => {
  it("ghim đầu, bỏ trùng, cắt limit", () => {
    const focus = item("focus");
    const page = [item("a"), item("focus"), item("b"), item("c")];
    expect(prependFocusCard(focus, page, 3).map((row) => row.id)).toEqual([
      "focus",
      "a",
      "b"
    ]);
  });
});
