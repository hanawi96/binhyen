import { describe, expect, it } from "vitest";

import { readMe, readProfile, readUser } from "./account-client";

describe("readProfile", () => {
  it("keeps valid topics only", () => {
    expect(
      readProfile({
        displayName: "An",
        topics: [
          { slug: "peace", label: "Bình yên", chosen: true },
          { slug: "nature", label: "Thiên nhiên" }
        ]
      })
    ).toEqual({
      displayName: "An",
      topics: [{ slug: "peace", label: "Bình yên", chosen: true }]
    });
  });

  it("rejects a missing name", () => {
    expect(readProfile({ topics: [] })).toBeNull();
  });
});

describe("readUser", () => {
  it("reads a public user", () => {
    expect(
      readUser({ id: "u1", email: "a@b.vn", displayName: "An", extra: 1 })
    ).toEqual({ id: "u1", email: "a@b.vn", displayName: "An" });
  });

  it("rejects incomplete values", () => {
    expect(readUser(null)).toBeNull();
    expect(readUser({ id: "u1", email: "a@b.vn" })).toBeNull();
    expect(readUser({ id: 1, email: "a@b.vn", displayName: "An" })).toBeNull();
  });
});

describe("readMe", () => {
  const user = { id: "u1", email: "a@b.vn", displayName: "An" };

  it("reads the user and unseen review results", () => {
    expect(readMe({ success: true, user, postNews: 2 })).toEqual({
      user,
      postNews: 2
    });
  });

  it("ignores bad counts and counts without a user", () => {
    expect(readMe({ user, postNews: -1 }).postNews).toBe(0);
    expect(readMe({ user, postNews: "3" }).postNews).toBe(0);
    expect(readMe({ user: null, postNews: 4 })).toEqual({
      user: null,
      postNews: 0
    });
  });
});
