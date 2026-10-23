
import { describe, expect, it } from "vitest";

import { demoContents } from "./demo-contents";
import { filterContents } from "./filter-contents";

describe("Content filtering", () => {
  it("returns all published content when no filters are selected", () => {
    const result = filterContents(
      demoContents,
      "all",
      "all"
    );

    expect(result).toHaveLength(6);
  });

  it("matches topic and mood together", () => {
    const result = filterContents(
      demoContents,
      "peace",
      "tired"
    );

    const ids = result.map((item) => item.id).sort();

    expect(ids).toEqual(["1", "3", "5"]);
  });

  it("filters only by topic when mood is all", () => {
    const result = filterContents(
      demoContents,
      "science",
      "all"
    );

    const ids = result.map((item) => item.id).sort();

    expect(ids).toEqual(["2", "4"]);
  });

  it("returns an empty list when nothing matches", () => {
    const result = filterContents(
      demoContents,
      "tips",
      "all"
    );

    expect(result).toEqual([]);
  });

  it("never returns draft content", () => {
    const draft = {
      ...demoContents[0],
      id: "draft-test",
      status: "draft" as const
    };

    const result = filterContents(
      [...demoContents, draft],
      "all",
      "all"
    );

    expect(
      result.some((item) => item.id === "draft-test")
    ).toBe(false);
  });
});
