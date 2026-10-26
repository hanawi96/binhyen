import { describe, expect, it } from "vitest";

import type { Profile } from "./account-client";
import {
  chosenSlugs,
  restoreByKey,
  toggleChosen,
  topicKey,
  withChosen
} from "./profile-session";

const sample: Profile = {
  displayName: "An",
  topics: [
    { slug: "peace", label: "Bình yên", chosen: true },
    { slug: "nature", label: "Thiên nhiên", chosen: false },
    { slug: "breath", label: "Hơi thở", chosen: true }
  ]
};

describe("topicKey", () => {
  it("sorts so order does not matter", () => {
    expect(topicKey(["b", "a"])).toBe("a.b");
    expect(topicKey(["a", "b"])).toBe("a.b");
    expect(topicKey([])).toBe("");
  });
});

describe("chosenSlugs / withChosen", () => {
  it("reads and paints chosen flags", () => {
    expect(chosenSlugs(sample)).toEqual(["peace", "breath"]);
    expect(withChosen(sample, ["nature"]).topics.map((t) => t.chosen)).toEqual([
      false,
      true,
      false
    ]);
  });
});

describe("restoreByKey", () => {
  it("restores from a saved key", () => {
    const dirty = withChosen(sample, ["nature"]);
    expect(chosenSlugs(restoreByKey(dirty, "breath.peace"))).toEqual([
      "peace",
      "breath"
    ]);
    expect(chosenSlugs(restoreByKey(dirty, ""))).toEqual([]);
  });
});

describe("toggleChosen", () => {
  it("adds and removes", () => {
    expect(toggleChosen(["a"], "b").chosen).toEqual(["a", "b"]);
    expect(toggleChosen(["a", "b"], "a").chosen).toEqual(["b"]);
  });

  it("blocks when at max", () => {
    const full = ["a", "b", "c"];
    expect(toggleChosen(full, "d", 3)).toEqual({
      chosen: full,
      blocked: true
    });
  });
});
