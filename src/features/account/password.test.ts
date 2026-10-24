import { describe, expect, it } from "vitest";

import { hashPassword, verifyDecoy, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const stored = await hashPassword("mat-khau-binh-yen", 1000);

    expect(stored.startsWith("pbkdf2-sha256$1000$")).toBe(true);
    expect(await verifyPassword("mat-khau-binh-yen", stored)).toBe(true);
    expect(await verifyPassword("mat-khau-khac", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    const first = await hashPassword("cung-mot-mat-khau", 1000);
    const second = await hashPassword("cung-mot-mat-khau", 1000);

    expect(first).not.toBe(second);
  });

  it("rejects malformed or too costly hashes", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "md5$1$a$b")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$999999$YQ$Yg")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$1000$***$Yg")).toBe(false);
  });

  it("decoy never matches", async () => {
    expect(await verifyDecoy("binhyen-decoy-password")).toBe(false);
  });
});
