import { describe, expect, it } from "vitest";

import {
  MAX_SEEN_BYTES,
  MAX_SEQ,
  countSeen,
  hasSeen,
  markSeen,
  mergeSeen,
  toSeenBits
} from "./seen-bits";

describe("markSeen / hasSeen", () => {
  it("bật đúng bit, nới mảng khi cần và đếm số bài mới", () => {
    const { bits, added } = markSeen(new Uint8Array(0), [1, 8, 17, 8]);

    expect(added).toBe(3);
    expect(bits.length).toBe(3);
    expect([...bits]).toEqual([0b00000010, 0b00000001, 0b00000010]);
    expect(hasSeen(bits, 1)).toBe(true);
    expect(hasSeen(bits, 8)).toBe(true);
    expect(hasSeen(bits, 17)).toBe(true);
    expect(hasSeen(bits, 2)).toBe(false);
    expect(hasSeen(bits, 9999)).toBe(false);
  });

  it("không sửa bản cũ và không đếm lại bài đã xem", () => {
    const first = markSeen(new Uint8Array(0), [5]).bits;
    const second = markSeen(first, [5, 6]);

    expect(hasSeen(first, 6)).toBe(false);
    expect(second.added).toBe(1);
    expect(hasSeen(second.bits, 6)).toBe(true);
  });

  it("bỏ qua seq sai: 0, âm, lẻ, quá giới hạn", () => {
    const { bits, added } = markSeen(new Uint8Array(0), [
      0,
      -3,
      1.5,
      Number.NaN,
      MAX_SEQ + 1
    ]);

    expect(added).toBe(0);
    expect(bits.length).toBe(0);
    expect(hasSeen(bits, 0)).toBe(false);
  });

  it("seq lớn nhất vẫn nằm gọn trong giới hạn của cột", () => {
    const { bits } = markSeen(new Uint8Array(0), [MAX_SEQ]);

    expect(bits.length).toBe(MAX_SEEN_BYTES);
    expect(hasSeen(bits, MAX_SEQ)).toBe(true);
  });
});

describe("mergeSeen / countSeen", () => {
  it("gộp hai lịch sử dài ngắn khác nhau", () => {
    const a = markSeen(new Uint8Array(0), [1, 2]).bits;
    const b = markSeen(new Uint8Array(0), [2, 40]).bits;
    const merged = mergeSeen(a, b);

    expect(countSeen(merged)).toBe(3);
    expect(hasSeen(merged, 1)).toBe(true);
    expect(hasSeen(merged, 40)).toBe(true);
    expect(mergeSeen(b, a)).toEqual(merged);
  });

  it("đếm đúng cả byte đầy", () => {
    expect(countSeen(Uint8Array.from([255, 0, 1]))).toBe(9);
    expect(countSeen(new Uint8Array(0))).toBe(0);
  });
});

describe("toSeenBits", () => {
  it("nhận ArrayBuffer, Uint8Array và mảng số như D1 trả về", () => {
    const bytes = Uint8Array.from([1, 2, 3]);

    expect([...toSeenBits(bytes.buffer)]).toEqual([1, 2, 3]);
    expect([...toSeenBits(bytes.subarray(1))]).toEqual([2, 3]);
    expect([...toSeenBits([1, 2, 3])]).toEqual([1, 2, 3]);
  });

  it("dữ liệu lạ thì coi như chưa xem gì", () => {
    expect(toSeenBits(null).length).toBe(0);
    expect(toSeenBits("abc").length).toBe(0);
    expect(toSeenBits([1, 256]).length).toBe(0);
    expect(toSeenBits([1, -1]).length).toBe(0);
    expect(toSeenBits([0.5]).length).toBe(0);
  });

  it("không trả về bản dùng chung bộ nhớ với dữ liệu gốc", () => {
    const source = Uint8Array.from([1]);
    const copy = toSeenBits(source);

    source[0] = 9;
    expect(copy[0]).toBe(1);
  });
});
