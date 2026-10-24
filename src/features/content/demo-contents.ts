
import type { ContentItem } from "./content.types";

/**
 * Du lieu mau trong giai doan phat trien.
 * Sau nay du lieu se duoc lay tu backend.
 */
export const demoContents = [
  {
    id: "1",
    slug: "ban-khong-can-ruc-ro-moi-ngay",
    format: "text",
    kind: "quote",
    status: "published",
    category: "Chữa lành & bình yên",
    title:
      "Bạn không cần phải rực rỡ mỗi ngày. Có những hôm, bình yên chỉ là được sống chậm lại một chút.",
    description:
      "Một lời nhắc nhỏ: bạn cũng xứng đáng được nghỉ ngơi.",
    tag: "Một chút dịu dàng",
    theme: "peace",
    topics: ["peace"],
    suitableMoods: ["tired", "stressed", "sad"]
  },
  {
    id: "2",
    slug: "anh-sang-mat-troi-den-trai-dat",
    format: "text",
    kind: "fact",
    status: "published",
    category: "Kiến thức kỳ thú",
    title:
      "Ánh sáng từ Mặt Trời mất khoảng 8 phút 20 giây để đến Trái Đất.",
    description:
      "Ngay cả khi nhìn lên bầu trời, chúng ta cũng đang nhìn thấy một khoảnh khắc trong quá khứ.",
    tag: "Khám phá vũ trụ",
    theme: "discovery",
    topics: ["science"],
    suitableMoods: ["curious", "happy", "calm"]
  },
  {
    id: "3",
    slug: "khong-phai-ngay-nao-cung-can-thanh-tuu",
    format: "text",
    kind: "insight",
    status: "published",
    category: "Góc nhìn cuộc sống",
    title:
      "Không phải ngày nào cũng cần có thành tựu. Có những ngày chỉ cần sống thật trọn vẹn.",
    description:
      "Giá trị của một ngày không chỉ nằm ở số việc bạn hoàn thành.",
    tag: "Một góc nhìn khác",
    theme: "story",
    topics: ["perspective", "peace"],
    suitableMoods: ["stressed", "tired", "calm"]
  },
  {
    id: "4",
    slug: "bach-tuoc-co-ba-trai-tim",
    format: "text",
    kind: "fact",
    status: "published",
    category: "Thiên nhiên kỳ thú",
    title:
      "Bạch tuộc có ba trái tim, và máu của chúng có màu xanh lam.",
    description:
      "Thiên nhiên luôn có những điều bất ngờ mà chúng ta chưa khám phá hết.",
    tag: "Thế giới tự nhiên",
    theme: "nature",
    topics: ["nature", "science"],
    suitableMoods: ["curious", "happy"]
  },
  {
    id: "5",
    slug: "hoc-cach-nhan-dien-cam-xuc",
    format: "text",
    kind: "psychology",
    status: "published",
    category: "Tâm lý học dễ hiểu",
    title:
      "Một cảm xúc khó chịu không nhất thiết là điều bạn cần phải loại bỏ ngay lập tức.",
    description:
      "Đôi khi, dành chút thời gian nhận diện cảm xúc cũng là một cách chăm sóc bản thân.",
    tag: "Hiểu mình hơn",
    theme: "psychology",
    topics: ["psychology", "peace"],
    suitableMoods: ["sad", "stressed", "tired"],
    article: {
      bodyMarkdown:
        "## Hiểu cảm xúc của mình\n\n" +
        "Đôi khi chúng ta muốn cảm giác khó chịu biến mất thật nhanh. " +
        "Nhưng cảm xúc không phải lúc nào cũng cần được giải quyết ngay.\n\n" +
        "Bạn có thể thử gọi tên cảm xúc mình đang trải qua, " +
        "quan sát nó và dành cho bản thân một khoảng nghỉ ngắn.",
      readingMinutes: 1
    }
  },
  {
    id: "6",
    slug: "mot-loi-cam-on-nho",
    format: "text",
    kind: "cute",
    status: "published",
    category: "Những điều dễ thương",
    title:
      "Đôi khi một lời cảm ơn, một nụ cười nhỏ cũng đủ khiến ngày của ai đó trở nên dễ chịu hơn.",
    description:
      "Những điều tử tế thường bắt đầu từ những hành động rất giản dị.",
    tag: "Niềm vui nhỏ",
    theme: "cute",
    topics: ["cute", "stories"],
    suitableMoods: ["happy", "sad", "calm"]
  }
] satisfies ContentItem[];
