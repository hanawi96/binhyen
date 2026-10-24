import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Khớp src/features/feed/rank-feed.ts */
const FRESH_MAX = 10;
const FRESH_OPEN = Number.MAX_SAFE_INTEGER;
const RANK_KEY_MAX = 2147483647;
const PAGE = 3;

const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const files = readdirSync(directory).filter((name) =>
  name.endsWith(".sqlite")
);

if (files.length === 0) {
  throw new Error("Local D1 file was not found");
}

let dbPath = null;
let bestCount = -1;

for (const file of files) {
  const candidate = new DatabaseSync(join(directory, file), {
    readOnly: true
  });
  const table = candidate
    .prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master
       WHERE type = 'table' AND name = 'contents'`
    )
    .get();

  if (table.n !== 1) {
    candidate.close();
    continue;
  }

  const size = candidate
    .prepare(`SELECT COUNT(*) AS n FROM contents`)
    .get();

  if (size.n > bestCount) {
    bestCount = size.n;
    dbPath = join(directory, file);
  }

  candidate.close();
}

if (!dbPath) {
  throw new Error("Local contents table was not found");
}

const db = new DatabaseSync(dbPath, { readOnly: true });

const counts = db
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM contents) AS contents,
       (SELECT COUNT(*) FROM contents WHERE id GLOB 'bench[0-9]*') AS bench,
       (SELECT COUNT(*) FROM contents WHERE id LIKE 'demo%') AS demo,
       (SELECT COUNT(*) FROM contents WHERE status = 'published') AS published`
  )
  .get();

console.log("counts", JSON.stringify(counts));

const CARD_COLUMNS = `
      c.id,
      c.slug,
      c.kind,
      c.status,
      c.category,
      c.title,
      c.description,
      c.tag,
      c.theme,
      c.published_at,
      c.rank_key,
      (
        SELECT json_group_array(ct.topic_slug)
        FROM content_topics ct
        WHERE ct.content_id = c.id
      ) AS topics_json,
      (
        SELECT json_group_array(cm.mood_slug)
        FROM content_moods cm
        WHERE cm.content_id = c.id
      ) AS moods_json`;

function freshEdge(column) {
  return `(
        SELECT f.${column}
        FROM contents f
        WHERE f.status = 'published'
          AND f.published_at > ?7
        ORDER BY f.published_at, f.id
        LIMIT 1 OFFSET ${FRESH_MAX - 1}
      )`;
}

function ringPart(lap, keySlot, filterSql) {
  const range = lap === 0 ? "" : "AND c.rank_key < ?5";

  return `SELECT * FROM (
    SELECT ${CARD_COLUMNS},
      ${lap} AS lap
    FROM contents c
    WHERE c.status = 'published'
      AND c.published_at IS NOT NULL
      AND (c.rank_key, c.id) > (?${keySlot}, ?${keySlot + 1})
      ${range}
      AND NOT (
        c.published_at > ?7
        AND (c.published_at, c.id) <= (
          COALESCE(?8, ${freshEdge("published_at")}, ${FRESH_OPEN}),
          COALESCE(?9, ${freshEdge("id")}, '')
        )
      )
      ${filterSql}
    ORDER BY c.rank_key, c.id
    LIMIT ?6
  )`;
}

function bucketSql(filterSql) {
  return `
    ${ringPart(0, 1, filterSql)}
    UNION ALL
    ${ringPart(1, 3, filterSql)}
    ORDER BY lap, rank_key, id
  `;
}

const topicFilter = `AND EXISTS (
    SELECT 1
    FROM content_topics ct
    WHERE ct.content_id = c.id
      AND ct.topic_slug IN (?10)
  )`;
const notTopicFilter = `AND NOT EXISTS (
    SELECT 1
    FROM content_topics ct
    WHERE ct.content_id = c.id
      AND ct.topic_slug IN (?10)
  )`;

const openSql = bucketSql("");
const scienceSql = bucketSql(topicFilter);
const otherSql = bucketSql(notTopicFilter);

const freshSql = `
      SELECT ${CARD_COLUMNS},
        0 AS lap
      FROM contents c
      WHERE c.status = 'published'
        AND c.published_at > ?1
        AND (c.published_at, c.id) > (?2, ?3)
        AND (c.published_at, c.id) <= (?4, ?5)
      ORDER BY c.published_at, c.id
      LIMIT ?6
    `;

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

  for (let index = 0; index < 8; index += 1) {
    stmt.all(...binds);
  }

  const samples = [];

  for (let index = 0; index < 60; index += 1) {
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

/** Binds ring: key0,id0, key1,id1, origin, limit, since, endAt, endId [, topic] */
function openBinds(origin, afterKey, afterId) {
  return [
    afterKey,
    afterId,
    -1,
    "",
    origin,
    PAGE + 1,
    FRESH_OPEN,
    FRESH_OPEN,
    ""
  ];
}

function topicBinds(origin, afterKey, afterId, topic) {
  return [...openBinds(origin, afterKey, afterId), topic];
}

const mid = db
  .prepare(
    `SELECT rank_key AS k, id
     FROM contents
     WHERE status = 'published'
     ORDER BY rank_key, id
     LIMIT 1 OFFSET 5000`
  )
  .get();

const origin = mid?.k ?? 0;
const deepKey = mid?.k ?? 0;
const deepId = mid?.id ?? "";

plan("ring-first", openSql, openBinds(origin, origin, ""));
plan("ring-deep", openSql, openBinds(origin, deepKey, deepId));
plan("science", scienceSql, topicBinds(origin, origin, "", "science"));
plan("other", otherSql, topicBinds(origin, origin, "", "science"));
plan("fresh", freshSql, [
  Math.floor(Date.now() / 1000) - 3600,
  Math.floor(Date.now() / 1000) - 3600,
  "",
  FRESH_OPEN,
  "",
  FRESH_MAX
]);

time("ring-first", openSql, openBinds(origin, origin, ""));
time("ring-deep", openSql, openBinds(origin, deepKey, deepId));
time("science", scienceSql, topicBinds(origin, origin, "", "science"));
time("other", otherSql, topicBinds(origin, origin, "", "science"));
time("fresh", freshSql, [
  Math.floor(Date.now() / 1000) - 3600,
  Math.floor(Date.now() / 1000) - 3600,
  "",
  FRESH_OPEN,
  "",
  FRESH_MAX
]);

const first = db.prepare(openSql).all(...openBinds(origin, origin, ""));
console.log(
  "ring-first ids",
  first.map((row) => row.id).join(",")
);

const usesRank = [];
for (const name of [
  "ring-first",
  "ring-deep",
  "science",
  "other"
]) {
  usesRank.push(name);
}

const rankPlan = db
  .prepare(`EXPLAIN QUERY PLAN ${openSql}`)
  .all(...openBinds(origin, origin, ""));
const scanText = rankPlan.map((row) => row.detail).join(" | ");
const usesPublicRank = scanText.includes("idx_contents_public_rank");
const usesPublicFeed = scanText.includes("idx_contents_public_feed");

console.log(
  "index-check",
  JSON.stringify({
    usesPublicRank,
    usesPublicFeed,
    mid: mid ?? null,
    checked: usesRank
  })
);

db.close();

const base =
  process.env.BENCH_FEED_URL?.replace(/\/$/, "") || "http://[::1]:5174";

async function httpTime(name, path) {
  const url = `${base}${path}`;
  const samples = [];

  for (let index = 0; index < 3; index += 1) {
    await fetch(url, { headers: { Accept: "application/json" } });
  }

  for (let index = 0; index < 20; index += 1) {
    const start = performance.now();
    const response = await fetch(url, {
      headers: { Accept: "application/json" }
    });
    const body = await response.json();
    const ms = performance.now() - start;

    if (!response.ok || !Array.isArray(body.items)) {
      throw new Error(
        `HTTP ${name} failed: status=${response.status} url=${url}`
      );
    }

    samples.push({ ms, count: body.items.length, matched: body.matched });
  }

  const times = samples.map((row) => row.ms).sort((a, b) => a - b);
  console.log(
    `HTTP ${name}`,
    JSON.stringify({
      p50: percentile(times, 0.5),
      p95: percentile(times, 0.95),
      max: times.at(-1).toFixed(3),
      items: samples[0]?.count ?? 0
    })
  );
}

if (process.argv.includes("--http")) {
  await httpTime("for-you", "/api/feed?limit=3");
  await httpTime("science", "/api/feed?topic=science&limit=3");

  const first = await fetch(`${base}/api/feed?limit=3`, {
    headers: { Accept: "application/json" }
  });
  const firstBody = await first.json();

  if (!first.ok || typeof firstBody.nextCursor !== "string") {
    throw new Error("Khong lay duoc nextCursor de do trang sau.");
  }

  await httpTime(
    "page-2",
    `/api/feed?limit=3&cursor=${encodeURIComponent(firstBody.nextCursor)}`
  );
}
