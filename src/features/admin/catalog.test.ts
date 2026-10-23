import { describe, expect, it } from "vitest";

import { parseCatalogUpdate } from "./catalog";

describe("Catalog update", () => {
  it("accepts a known topic label and order", () => {
    expect(
      parseCatalogUpdate({
        kind: "topic",
        slug: "peace",
        label: "  Bình yên  ",
        sortOrder: 2
      })
    ).toEqual({
      ok: true,
      value: {
        kind: "topic",
        slug: "peace",
        label: "Bình yên",
        sortOrder: 2
      }
    });
  });

  it("rejects a new slug, a blank name, and a fractional order", () => {
    expect(parseCatalogUpdate({ kind: "topic", slug: "new-topic", label: "Mới", sortOrder: 1 }).ok).toBe(false);
    expect(parseCatalogUpdate({ kind: "mood", slug: "calm", label: "   ", sortOrder: 1 }).ok).toBe(false);
    expect(parseCatalogUpdate({ kind: "mood", slug: "calm", label: "Êm", sortOrder: 1.5 }).ok).toBe(false);
  });
});
