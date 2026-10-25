import { readFileSync } from "node:fs";

const html = readFileSync("backups/prod-home.html", "utf8");
const labels = [
  "Tình Yêu",
  "Công nghệ",
  "Tâm Linh",
  "Facts",
  "Cuộc sống",
  "Dành cho bạn",
  "Yêu thích nhất",
  "Câu chuyện",
  "Khoa học"
];

for (const label of labels) {
  console.log(`${label}: ${html.includes(label)}`);
}

console.log(`bytes: ${Buffer.byteLength(html)}`);
console.log(`has ExploreFeed: ${html.includes("ExploreFeed")}`);
