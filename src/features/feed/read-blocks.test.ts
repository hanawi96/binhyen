import { describe, expect, it } from "vitest";

import { readBlocks, splitSentences } from "./read-blocks";

describe("splitSentences", () => {
  it("đặt mỗi câu trên một dòng và giữ dấu phẩy trong câu", () => {
    expect(
      splitSentences(
        "Đôi khi chúng ta muốn cảm giác khó chịu biến mất thật nhanh. Nhưng cảm xúc không phải lúc nào cũng cần được giải quyết ngay."
      )
    ).toEqual([
      "Đôi khi chúng ta muốn cảm giác khó chịu biến mất thật nhanh.",
      "Nhưng cảm xúc không phải lúc nào cũng cần được giải quyết ngay."
    ]);

    expect(
      splitSentences(
        "Bạn ngồi xuống, quan sát hơi thở; rồi mỉm cười. Hãy nghỉ một lát."
      )
    ).toEqual([
      "Bạn ngồi xuống, quan sát hơi thở; rồi mỉm cười.",
      "Hãy nghỉ một lát."
    ]);
  });

  it("không cắt số, chữ viết tắt, dấu lửng gộp và mảnh ngắn", () => {
    expect(
      splitSentences("Lúc 8.20 có 1.000 cách. Hãy chọn một.")
    ).toEqual(["Lúc 8.20 có 1.000 cách.", "Hãy chọn một."]);

    expect(splitSentences("TS. Nguyễn đến. PGS.TS. Lan gật đầu.")).toEqual([
      "TS. Nguyễn đến.",
      "PGS.TS. Lan gật đầu."
    ]);

    expect(splitSentences("Xem thêm v.v. trong sách. Rồi khép trang lại.")).toEqual([
      "Xem thêm v.v. trong sách.",
      "Rồi khép trang lại."
    ]);

    expect(splitSentences("Chờ đã... Rồi nghỉ. Ông nói: \"Hãy ở lại.\" Vâng.")).toEqual([
      "Chờ đã...",
      "Rồi nghỉ.",
      "Ông nói: \"Hãy ở lại.\" Vâng."
    ]);
  });

  it("ngắt sau chấm hỏi và chấm than", () => {
    expect(splitSentences("Bạn ổn chứ? Tôi ở đây! Hãy thở chậm lại.")).toEqual([
      "Bạn ổn chứ?",
      "Tôi ở đây!",
      "Hãy thở chậm lại."
    ]);
  });
});

describe("readBlocks", () => {
  it("giữ đề mục nguyên và không sửa bài đã lưu thành từng câu", () => {
    const blocks = readBlocks(
      "## Hiểu cảm xúc của mình\n\nĐôi khi nhanh. Nhưng chậm.\n\n> Hãy ở lại. Rồi thở."
    );

    expect(blocks).toEqual([
      { kind: "heading", text: "Hiểu cảm xúc của mình" },
      { kind: "paragraph", text: "Đôi khi nhanh. Nhưng chậm." },
      { kind: "quote", text: "Hãy ở lại. Rồi thở." }
    ]);
  });
});
