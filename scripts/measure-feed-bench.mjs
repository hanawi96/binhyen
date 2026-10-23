import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const directory =
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file = readdirSync(directory).find((name) =>
  name.endsWith(".sqlite")
);

if (!file) {
  throw new Error("Local D1 file was not found");
}

const db = new DatabaseSync(`${directory}/${file}`, {
  readOnly: true
});

const counts = db
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM contents) AS contents,
       (SELECT COUNT(*) FROM contents WHERE id GLOB 'bench[0-9]*') AS bench,
       (SELECT COUNT(*) FROM contents WHERE status = 'published' AND id NOT GLOB 'bench[0-9]*') AS demo`
  )
  .get();

console.log("counts", JSON.stringify(counts));

const page = `
  SELECT
    c.id,
    c.published_at,
    (
      SELECT json_group_array(ct.topic_slug)
      FROM content_topics ct
      WHERE ct.content_id = c.id
    ) AS topics_json,
    (
      SELECT json_group_array(cm.mood_slug)
      FROM content_moods cm
      WHERE cm.content_id = c.id
    ) AS moods_json
  FROM contents c
  WHERE c.status = 'published'
    AND c.published_at IS NOT NULL
    AND (
      ?1 IS NULL
      OR c.published_at < ?1
      OR (c.published_at = ?1 AND c.id < ?2)
    )
`;

const order = " ORDER BY c.published_at DESC, c.id DESC LIMIT ?3";
const topic =
  " AND EXISTS (SELECT 1 FROM content_topics ct WHERE ct.content_id = c.id AND ct.topic_slug = ?4)";
const notTopic =
  " AND NOT EXISTS (SELECT 1 FROM content_topics ct WHERE ct.content_id = c.id AND ct.topic_slug = ?4)";

function plan(name, sql, binds) {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds);
  console.log(`PLAN ${name}`);

  for (const row of rows) {
    console.log(`  ${row.detail}`);
  }
}

function percentile(samples, ratio) {
  const index = Math.min(
    samples.length - 1,
    Math.floor(ratio * (samples.length - 1))
  );

  return samples[index].toFixed(3);
}

function time(name, sql, binds) {
  const stmt = db.prepare(sql);

  for (let index = 0; index < 10; index += 1) {
    stmt.all(...binds);
  }

  const samples = [];

  for (let index = 0; index < 80; index += 1) {
    const start = performance.now();
    stmt.all(...binds);
    samples.push(performance.now() - start);
  }

  samples.sort((left, right) => left - right);
  console.log(
    `TIME ${name}`,
    JSON.stringify({
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      max: samples.at(-1).toFixed(3)
    })
  );
}

const firstSql = page + order;
const scienceSql = `${page}${topic} ORDER BY c.published_at DESC, c.id DESC LIMIT ?5`;
const otherSql = `${page}${notTopic} ORDER BY c.published_at DESC, c.id DESC LIMIT ?5`;

plan("first", firstSql, [null, null, 4]);
plan("deep", firstSql, [1699995000, "bench00005000", 4]);
plan("science", scienceSql, [null, null, 4, "science", 4]);
plan("other", otherSql, [null, null, 4, "science", 4]);

time("first", firstSql, [null, null, 4]);
time("deep", firstSql, [1699995000, "bench00005000", 4]);
time("science", scienceSql, [null, null, 4, "science", 4]);
time("other", otherSql, [null, null, 4, "science", 4]);

const first = db.prepare(firstSql).all(null, null, 4);
console.log("first ids", first.map((row) => row.id).join(","));
