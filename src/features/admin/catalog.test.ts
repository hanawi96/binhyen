import { describe, expect, it } from "vitest";

import {
  catalogSlugFromLabel,
  parseCatalogCreate,
  parseCatalogUpdate
} from "./catalog";

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

  it("rejects a blank name, bad slug, and a fractional order", () => {
    expect(
      parseCatalogUpdate({
        kind: "topic",
        slug: "BAD SLUG",
        label: "Mới",
        sortOrder: 1
      }).ok
    ).toBe(false);
    expect(
      parseCatalogUpdate({
        kind: "mood",
        slug: "calm",
        label: "   ",
        sortOrder: 1
      }).ok
    ).toBe(false);
    expect(
      parseCatalogUpdate({
        kind: "mood",
        slug: "calm",
        label: "Êm",
        sortOrder: 1.5
      }).ok
    ).toBe(false);
  });
});

describe("Catalog create", () => {
  it("builds a topic from label and kind", () => {
    expect(
      parseCatalogCreate({
        kind: "topic",
        label: "  Góc nhỏ  "
      })
    ).toEqual({
      ok: true,
      value: {
        kind: "topic",
        label: "Góc nhỏ",
        slug: "goc-nho"
      }
    });
  });

  it("builds a mood and accepts an explicit slug", () => {
    expect(
      parseCatalogCreate({
        kind: "mood",
        label: "Nhẹ lòng",
        slug: "nhe-long"
      })
    ).toEqual({
      ok: true,
      value: {
        kind: "mood",
        label: "Nhẹ lòng",
        slug: "nhe-long"
      }
    });
  });

  it("rejects missing kind, blank label, and empty slug source", () => {
    expect(parseCatalogCreate({ label: "A" }).ok).toBe(false);
    expect(
      parseCatalogCreate({ kind: "topic", label: "   " }).ok
    ).toBe(false);
    expect(catalogSlugFromLabel(" --- ")).toBeNull();
  });
});
