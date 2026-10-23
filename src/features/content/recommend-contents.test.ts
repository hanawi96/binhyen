
import { describe, expect, it } from "vitest";

import { demoContents } from "./demo-contents";
import { recommendContents } from "./recommend-contents";

describe("Content recommendation", () => {
  it("does not return duplicate content IDs", () => {
    const result = recommendContents(
      demoContents,
      "all",
      "all",
      100
    );

    const ids = result.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(result).toHaveLength(6);
  });

  it("prioritizes content matching the selected topic and mood", () => {
    const result = recommendContents(
      demoContents,
      "peace",
      "tired",
      6
    );

    expect(result.length).toBeGreaterThan(0);

    const first = result[0];

    expect(first.topics).toContain("peace");
    expect(first.suitableMoods).toContain("tired");
  });

  it("includes other topics when the recommendation pool is expanded", () => {
    const result = recommendContents(
      demoContents,
      "peace",
      "tired",
      6
    );

    expect(result).toHaveLength(6);

    expect(
      result.some(
        (item) => !item.topics.includes("peace")
      )
    ).toBe(true);
  });

  it("produces stable results for the same inputs", () => {
    const first = recommendContents(
      demoContents,
      "science",
      "curious",
      6
    );

    const second = recommendContents(
      demoContents,
      "science",
      "curious",
      6
    );

    expect(
      first.map((item) => item.id)
    ).toEqual(
      second.map((item) => item.id)
    );
  });

  it("respects the requested result limit", () => {
    expect(
      recommendContents(
        demoContents,
        "all",
        "all",
        2
      )
    ).toHaveLength(2);

    expect(
      recommendContents(
        demoContents,
        "all",
        "all",
        0
      )
    ).toEqual([]);

    expect(
      recommendContents(
        demoContents,
        "all",
        "all",
        100
      )
    ).toHaveLength(6);
  });

  it("ignores duplicate IDs and unpublished content", () => {
    const draft = {
      ...demoContents[0],
      id: "draft-001",
      status: "draft" as const
    };

    const input = [
      ...demoContents,
      demoContents[0],
      draft
    ];

    const result = recommendContents(
      input,
      "all",
      "all",
      100
    );

    const ids = result.map((item) => item.id);

    expect(result).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids).not.toContain("draft-001");
  });
});
