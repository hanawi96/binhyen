import { describe, expect, it } from "vitest";

import {
  actorViewerKey,
  isViewerKey,
  resolveViewerKey,
  userViewerKey
} from "./viewer-key";

const USER = "3f6c1d2e-9a4b-4c8d-8e7f-0a1b2c3d4e5f";
const ACTOR = "AbCdEfGhIjKlMnOpQrStUv";

describe("viewer key", () => {
  it("đăng nhập thì theo tài khoản, kể cả khi có cookie ẩn danh", () => {
    expect(resolveViewerKey({ userId: USER, actorId: ACTOR })).toBe(
      `u:${USER}`
    );
  });

  it("chưa đăng nhập thì theo mã ẩn danh", () => {
    expect(resolveViewerKey({ userId: null, actorId: ACTOR })).toBe(
      `a:${ACTOR}`
    );
  });

  it("không có ai hoặc mã sai thì null", () => {
    expect(resolveViewerKey({ userId: null, actorId: null })).toBeNull();
    expect(resolveViewerKey({ userId: "short", actorId: "bad" })).toBeNull();
    expect(userViewerKey("x".repeat(81))).toBeNull();
    expect(actorViewerKey(`${ACTOR}x`)).toBeNull();
  });

  it("tài khoản lỗi thì vẫn dùng được mã ẩn danh", () => {
    expect(resolveViewerKey({ userId: "short", actorId: ACTOR })).toBe(
      `a:${ACTOR}`
    );
  });

  it("khóa luôn khớp CHECK của bảng viewer_feed_state", () => {
    const keys = [userViewerKey(USER), actorViewerKey(ACTOR)];

    for (const key of keys) {
      expect(key).not.toBeNull();
      expect(isViewerKey(key ?? "")).toBe(true);
      expect((key ?? "").length).toBeGreaterThanOrEqual(18);
      expect((key ?? "").length).toBeLessThanOrEqual(90);
    }

    expect(isViewerKey(`x:${ACTOR}`)).toBe(false);
    expect(isViewerKey(`a:${ACTOR}'`)).toBe(false);
  });
});
