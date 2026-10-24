import { describe, expect, it } from "vitest";

import {
  buildPollState,
  parsePollOptions,
  parsePollVote,
  pollOptionId
} from "./content-polls";

describe("content polls", () => {
  it("parses 2 to 4 unique option labels", () => {
    expect(parsePollOptions(["A", "B"])).toEqual(["A", "B"]);
    expect(parsePollOptions(["  Một  ", "Hai", "Ba"])).toEqual([
      "Một",
      "Hai",
      "Ba"
    ]);
    expect(parsePollOptions(["A"])).toBeNull();
    expect(parsePollOptions(["A", "A"])).toBeNull();
    expect(parsePollOptions(["A", "B", "C", "D", "E"])).toBeNull();
  });

  it("accepts only o1..o4 vote ids", () => {
    expect(parsePollVote({ optionId: "o2" })).toEqual({ optionId: "o2" });
    expect(parsePollVote({ optionId: "x1" })).toBeNull();
    expect(parsePollVote({})).toBeNull();
  });

  it("hides counts until the viewer has voted", () => {
    const rows = [
      { option_id: "o1", label: "Êm", votes: 3 },
      { option_id: "o2", label: "Vui", votes: 1 }
    ];

    expect(buildPollState(rows, null)).toMatchObject({
      revealed: false,
      total: 4,
      votedOptionId: null,
      options: [
        { id: "o1", votes: null, percent: null },
        { id: "o2", votes: null, percent: null }
      ]
    });

    expect(buildPollState(rows, "o1")).toMatchObject({
      revealed: true,
      votedOptionId: "o1",
      options: [
        { id: "o1", votes: 3, percent: 75 },
        { id: "o2", votes: 1, percent: 25 }
      ]
    });
  });

  it("builds stable option ids", () => {
    expect(pollOptionId(0)).toBe("o1");
    expect(pollOptionId(3)).toBe("o4");
  });
});
