import { writeFileSync } from "node:fs";

const count = 10000;
const topics = [
  "peace",
  "stories",
  "science",
  "nature",
  "psychology",
  "perspective",
  "cute",
  "tips"
];
const moods = [
  "calm",
  "tired",
  "stressed",
  "sad",
  "happy",
  "curious"
];
const kinds = [
  "quote",
  "story",
  "fact",
  "insight",
  "psychology",
  "cute",
  "tip"
];
const themes = [
  "peace",
  "discovery",
  "story",
  "nature",
  "psychology",
  "cute"
];

function idFor(n) {
  return `bench${String(n).padStart(8, "0")}`;
}

function rows(sqlFor, size) {
  const chunks = [];

  for (let start = 1; start <= count; start += size) {
    const end = Math.min(count, start + size - 1);
    const values = [];

    for (let n = start; n <= end; n += 1) {
      values.push(sqlFor(n));
    }

    chunks.push(values.join(",\n"));
  }

  return chunks;
}

const contentChunks = rows(
  (n) => {
    const id = idFor(n);
    const kind = kinds[n % kinds.length];
    const theme = themes[n % themes.length];

    return `('${id}','bench-${n}','${kind}','published','Do','Bai do ${n}','Mo ta do.','Do','${theme}',${1700000000 - n})`;
  },
  400
);

const topicChunks = rows(
  (n) => `('${idFor(n)}','${topics[n % topics.length]}')`,
  800
);

const moodChunks = rows(
  (n) => `('${idFor(n)}','${moods[n % moods.length]}')`,
  800
);

const insert = [
  ...contentChunks.map(
    (values) =>
      `INSERT INTO contents (id, slug, kind, status, category, title, description, tag, theme, published_at)\nVALUES\n${values};`
  ),
  ...topicChunks.map(
    (values) =>
      `INSERT INTO content_topics (content_id, topic_slug)\nVALUES\n${values};`
  ),
  ...moodChunks.map(
    (values) =>
      `INSERT INTO content_moods (content_id, mood_slug)\nVALUES\n${values};`
  ),
].join("\n");

const cleanup = `DELETE FROM content_topics WHERE content_id GLOB 'bench[0-9]*';
DELETE FROM content_moods WHERE content_id GLOB 'bench[0-9]*';
DELETE FROM contents WHERE id GLOB 'bench[0-9]*';
`;

const target = process.argv[2];

if (target === "cleanup") {
  writeFileSync(process.argv[3], cleanup);
} else {
  writeFileSync(target, insert);
}

console.log(`rows=${count}`);
