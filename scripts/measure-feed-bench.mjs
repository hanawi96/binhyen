/**
 * Do feed tren D1 local sau khi seed ~20k bai.
 *
 *   npm run seed:bench
 *   npm run measure:bench
 *   npm run measure:bench -- --http
 *
 * Khop SQL trong src/features/feed/load-public-feed.ts (vong + lan bai moi).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const RANK_KEY_MAX = 2147483647;
const PAGE = 3;
const LANE_ROWS = PAGE + 1;
const VIEWER_KEY = "a:BenchMeasureActor00001";

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

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 8000");
db.exec("PRAGMA foreign_keys = ON");

const counts = db
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM contents) AS contents,
       (SELECT COUNT(*) FROM contents WHERE id GLOB 'bench[0-9]*') AS bench,
       (SELECT COUNT(*) FROM contents WHERE id LIKE 'demo%') AS demo,
       (SELECT COUNT(*) FROM contents WHERE status = 'published') AS published,
       (SELECT COALESCE(MAX(seq), 0) FROM contents) AS max_seq,
       (SELECT last_seq FROM content_seq_counter WHERE id = 1) AS counter`
  )
  .get();

console.log("counts", JSON.stringify(counts));

if (counts.bench < 15_000) {
  console.warn(
    `Canh bao: chi co ${counts.bench} bai bench (nen >= 15000). Chay: npm run seed:bench`
  );
}

/** Khop src/features/feed/feed-rows.ts */
const CARD_COLUMNS = `
  c.id,
  c.slug,
  c.format,
  c.kind,
  c.status,
  c.category,
  c.title,
  c.description,
  c.tag,
  c.theme,
  c.published_at,
  c.rank_key,
  c.seq,
  (
    SELECT json_group_array(ct.topic_slug)
    FROM content_topics ct
    WHERE ct.content_id = c.id
  ) AS topics_json,
  (
    SELECT json_group_array(cm.mood_slug)
    FROM content_moods cm
    WHERE cm.content_id = c.id
  ) AS moods_json,
  (
    SELECT CASE
      WHEN d.body_markdown IS NOT NULL
        AND length(trim(d.body_markdown)) > 0
      THEN 1
      ELSE 0
    END
    FROM content_details d
    WHERE d.content_id = c.id
  ) AS has_article,
  COALESCE(
    (SELECT s.like_count FROM content_stats s WHERE s.content_id = c.id),
    0
  ) AS like_count,
  COALESCE(
    (SELECT s.save_count FROM content_stats s WHERE s.content_id = c.id),
    0
  ) AS save_count,
  COALESCE(
    (SELECT s.share_count FROM content_stats s WHERE s.content_id = c.id),
    0
  ) AS share_count`;

/** Khop ringLaneQuery: khong filter chu de. */
const ringOpenSql = `
  SELECT ${CARD_COLUMNS}
  FROM contents c
  WHERE c.status = 'published'
    AND c.published_at IS NOT NULL
    AND (c.rank_key, c.id) > (?1, ?2)
    AND c.rank_key < ?3
    AND (?4 IS NULL OR c.published_at <= ?4)
    AND (?5 IS NULL OR c.author_id IS NULL OR c.author_id <> ?5)
  ORDER BY c.rank_key, c.id
  LIMIT ?6`;

/** preferred + topic science */
const ringScienceSql = `
  SELECT ${CARD_COLUMNS}
  FROM contents c
  WHERE c.status = 'published'
    AND c.published_at IS NOT NULL
    AND (c.rank_key, c.id) > (?1, ?2)
    AND c.rank_key < ?3
    AND (?4 IS NULL OR c.published_at <= ?4)
    AND (?5 IS NULL OR c.author_id IS NULL OR c.author_id <> ?5)
    AND EXISTS (
      SELECT 1
      FROM content_topics ct
      WHERE ct.content_id = c.id
        AND ct.topic_slug IN (?7)
    )
  ORDER BY c.rank_key, c.id
  LIMIT ?6`;

/** surprise: khong dung chu de science */
const ringSurpriseSql = `
  SELECT ${CARD_COLUMNS}
  FROM contents c
  WHERE c.status = 'published'
    AND c.published_at IS NOT NULL
    AND (c.rank_key, c.id) > (?1, ?2)
    AND c.rank_key < ?3
    AND (?4 IS NULL OR c.published_at <= ?4)
    AND (?5 IS NULL OR c.author_id IS NULL OR c.author_id <> ?5)
    AND NOT EXISTS (
      SELECT 1
      FROM content_topics ct
      WHERE ct.content_id = c.id
        AND ct.topic_slug IN (?7)
    )
  ORDER BY c.rank_key, c.id
  LIMIT ?6`;

const freshSql = `
  SELECT ${CARD_COLUMNS}
  FROM contents c
  WHERE c.status = 'published'
    AND (c.published_at, c.id) > (?1, ?2)
    AND (?3 IS NULL OR c.author_id IS NULL OR c.author_id <> ?3)
  ORDER BY c.published_at, c.id
  LIMIT ?4`;

const seenTargetsSql = `
  SELECT seq, published_at, status
  FROM contents
  WHERE id IN (?1, ?2, ?3, ?4, ?5)`;

const viewerReadSql = `
  SELECT viewer_key, seen_bits, seen_count, positions_json, fresh_at, loop_count, version
  FROM viewer_feed_state
  WHERE viewer_key = ?1`;

function plan(name, sql, binds) {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds);
  console.log(`PLAN ${name}`);

  for (const row of rows) {
    console.log(`  ${row.detail}`);
  }

  return rows.map((row) => row.detail).join(" | ");
}

function percentile(samples, ratio) {
  const index = Math.min(
    samples.length - 1,
    Math.floor(ratio * (samples.length - 1))
  );

  return samples[index].toFixed(3);
}

function time(name, run, rounds = 60, warm = 8) {
  for (let index = 0; index < warm; index += 1) run();

  const samples = [];

  for (let index = 0; index < rounds; index += 1) {
    const start = performance.now();
    run();
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

function ringBinds(origin, afterKey, afterId, freshAt = null) {
  return [
    afterKey,
    afterId,
    RANK_KEY_MAX + 1,
    freshAt,
    null,
    LANE_ROWS
  ];
}

function topicBinds(origin, afterKey, afterId, topic, freshAt = null) {
  return [...ringBinds(origin, afterKey, afterId, freshAt), topic];
}

const mid = db
  .prepare(
    `SELECT rank_key AS k, id
     FROM contents
     WHERE status = 'published'
     ORDER BY rank_key, id
     LIMIT 1 OFFSET 10000`
  )
  .get();

const origin = mid?.k ?? 0;
const deepKey = mid?.k ?? 0;
const deepId = mid?.id ?? "";
const now = Math.floor(Date.now() / 1000);
const freshAt = now - 3600;

const openFirst = ringBinds(origin, origin, "");
const openDeep = ringBinds(origin, deepKey, deepId);
const openFreshCut = ringBinds(origin, origin, "", freshAt);
const scienceFirst = topicBinds(origin, origin, "", "science", freshAt);
const surpriseFirst = topicBinds(origin, origin, "", "science", freshAt);
const freshBinds = [freshAt, "", null, LANE_ROWS];

const plans = {
  ringOpen: plan("ring-open-first", ringOpenSql, openFirst),
  ringDeep: plan("ring-open-deep", ringOpenSql, openDeep),
  ringFreshCut: plan("ring-open-freshAt", ringOpenSql, openFreshCut),
  science: plan("ring-science", ringScienceSql, scienceFirst),
  surprise: plan("ring-surprise", ringSurpriseSql, surpriseFirst),
  fresh: plan("fresh-lane", freshSql, freshBinds),
  seenTargets: plan("seen-targets", seenTargetsSql, [
    "bench00000001",
    "bench00000002",
    "bench00000003",
    "bench00000004",
    "bench00000005"
  ]),
  viewerRead: plan("viewer-read", viewerReadSql, [VIEWER_KEY])
};

const ringStmt = db.prepare(ringOpenSql);
const scienceStmt = db.prepare(ringScienceSql);
const surpriseStmt = db.prepare(ringSurpriseSql);
const freshStmt = db.prepare(freshSql);

time("ring-open-first", () => ringStmt.all(...openFirst));
time("ring-open-deep", () => ringStmt.all(...openDeep));
time("ring-open-freshAt", () => ringStmt.all(...openFreshCut));
time("ring-science", () => scienceStmt.all(...scienceFirst));
time("ring-surprise", () => surpriseStmt.all(...surpriseFirst));
time("fresh-lane", () => freshStmt.all(...freshBinds));

/** Mot "batch" loader: 3 nhom vong + 1 lan bai moi (nhu readLanes). */
time("loader-batch-4lanes", () => {
  ringStmt.all(...openFreshCut);
  scienceStmt.all(...scienceFirst);
  surpriseStmt.all(...surpriseFirst);
  freshStmt.all(...freshBinds);
});

const firstRows = ringStmt.all(...openFirst);
console.log(
  "ring-open-first ids",
  firstRows.map((row) => row.id).join(",")
);

console.log(
  "index-check",
  JSON.stringify({
    usesPublicRank: plans.ringOpen.includes("idx_contents_public_rank"),
    usesPublicFeed: plans.fresh.includes("idx_contents_public_feed"),
    scienceUsesRank: plans.science.includes("idx_contents_public_rank"),
    scienceUsesTopicIndex: /content_topics/.test(plans.science),
    noTempSortRing: !plans.ringOpen.includes("TEMP B-TREE"),
    noTempSortFresh: !plans.fresh.includes("TEMP B-TREE"),
    seenTargetsById:
      plans.seenTargets.includes("sqlite_autoindex_contents_1") ||
      plans.seenTargets.includes("PRIMARY KEY"),
    viewerByKey: /viewer_feed_state/.test(plans.viewerRead),
    mid: mid ?? null
  })
);

// --- Ghi: bitmap da xem + vi tri (rollback sau khi do) ---
function markBits(bits, seqs) {
  let size = bits.length;

  for (const seq of seqs) {
    if (seq > 0) size = Math.max(size, (seq >> 3) + 1);
  }

  const next = new Uint8Array(size);
  next.set(bits);

  for (const seq of seqs) {
    if (seq <= 0) continue;
    const index = seq >> 3;
    next[index] = (next[index] ?? 0) | (1 << (seq & 7));
  }

  return next;
}

function countBits(bits) {
  let total = 0;

  for (const byte of bits) {
    let rest = byte;
    while (rest !== 0) {
      rest &= rest - 1;
      total += 1;
    }
  }

  return total;
}

const halfSeqs = db
  .prepare(
    `SELECT seq FROM contents
     WHERE status = 'published' AND seq > 0
     ORDER BY seq
     LIMIT ?1`
  )
  .all(Math.min(10_000, Math.floor(counts.published / 2)))
  .map((row) => row.seq);

const halfBits = markBits(new Uint8Array(0), halfSeqs);
const fiveIds = firstRows.slice(0, 5).map((row) => row.id);
while (fiveIds.length < 5) fiveIds.push(fiveIds[0] ?? "bench00000001");

const pageCursor =
  "v6:all:all:-:" +
  String(origin) +
  ":" +
  String(freshAt) +
  ":0:-:-:x:x:x:x:-:-:-:-";

db.exec("BEGIN");

try {
  db.prepare(`DELETE FROM viewer_feed_state WHERE viewer_key = ?1`).run(
    VIEWER_KEY
  );

  time(
    "write-insert-viewer-half-seen",
    () => {
      db.prepare(`DELETE FROM viewer_feed_state WHERE viewer_key = ?1`).run(
        VIEWER_KEY
      );
      db.prepare(
        `INSERT INTO viewer_feed_state (
           viewer_key, seen_bits, seen_count, positions_json, fresh_at, created_at, updated_at
         ) VALUES (?1, COALESCE(?2, x''), ?3, '{}', ?4, ?5, ?5)`
      ).run(
        VIEWER_KEY,
        halfBits,
        countBits(halfBits),
        freshAt,
        now
      );
    },
    30,
    4
  );

  const targetsStmt = db.prepare(seenTargetsSql);
  time(
    "write-select-seen-targets",
    () => targetsStmt.all(...fiveIds),
    60,
    8
  );

  const versionRow = db
    .prepare(
      `SELECT version, seen_bits, seen_count FROM viewer_feed_state WHERE viewer_key = ?1`
    )
    .get(VIEWER_KEY);

  const baseBits = new Uint8Array(versionRow.seen_bits);
  const addSeqs = firstRows.slice(0, 5).map((row) => row.seq);
  const nextBits = markBits(baseBits, addSeqs);

  time(
    "write-update-seen-batch5",
    () => {
      db.prepare(
        `UPDATE viewer_feed_state
         SET seen_bits = COALESCE(?1, x''),
             seen_count = ?2,
             positions_json = ?3,
             fresh_at = ?4,
             version = version + 1,
             updated_at = ?5
         WHERE viewer_key = ?6`
      ).run(
        nextBits,
        countBits(nextBits),
        JSON.stringify({ "all:all": pageCursor }),
        Math.max(freshAt, now - 10),
        now,
        VIEWER_KEY
      );
    },
    40,
    6
  );

  const after = db
    .prepare(
      `SELECT seen_count, length(seen_bits) AS bytes, version,
              length(positions_json) AS pos_len
       FROM viewer_feed_state WHERE viewer_key = ?1`
    )
    .get(VIEWER_KEY);

  console.log(
    "write-sample",
    JSON.stringify({
      halfSeen: halfSeqs.length,
      halfBytes: halfBits.length,
      after
    })
  );
} finally {
  db.exec("ROLLBACK");
}

db.close();

const base =
  process.env.BENCH_FEED_URL?.replace(/\/$/, "") || "http://localhost:5174";

async function httpTime(name, path, init = {}) {
  const url = `${base}${path}`;
  const samples = [];

  for (let index = 0; index < 3; index += 1) {
    await fetch(url, { headers: { Accept: "application/json" }, ...init });
  }

  for (let index = 0; index < 20; index += 1) {
    const start = performance.now();
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      ...init
    });
    const body = await response.json();
    const ms = performance.now() - start;

    if (!response.ok || body.success !== true || !Array.isArray(body.items)) {
      throw new Error(
        `HTTP ${name} failed: status=${response.status} url=${url}`
      );
    }

    samples.push({
      ms,
      count: body.items.length,
      matched: body.matched,
      notice: body.notice ?? null,
      pageCursor: typeof body.pageCursor === "string"
    });
  }

  const times = samples.map((row) => row.ms).sort((a, b) => a - b);
  console.log(
    `HTTP ${name}`,
    JSON.stringify({
      p50: percentile(times, 0.5),
      p95: percentile(times, 0.95),
      max: times.at(-1).toFixed(3),
      items: samples[0]?.count ?? 0,
      pageCursor: samples[0]?.pageCursor ?? false
    })
  );
}

async function httpCrawl(limit = 20, pages = 40) {
  const jar = new Map();
  const seen = new Set();
  const times = [];
  let cursor = null;
  let notices = 0;

  function storeCookies(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const part of raw) {
      const [pair] = part.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  function cookieHeader() {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  for (let page = 0; page < pages; page += 1) {
    const url = new URL("/api/feed", base);
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);

    const start = performance.now();
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(jar.size ? { Cookie: cookieHeader() } : {})
      }
    });
    const body = await response.json();
    times.push(performance.now() - start);
    storeCookies(response);

    if (!response.ok || !Array.isArray(body.items)) {
      throw new Error(`crawl failed page=${page} status=${response.status}`);
    }

    if (body.notice === "all-seen") notices += 1;

    for (const item of body.items) {
      if (seen.has(item.id)) {
        console.log(
          "crawl-duplicate",
          JSON.stringify({ page, id: item.id, unique: seen.size })
        );
        return;
      }
      seen.add(item.id);
    }

    // Bao da xem de bitmap day; do chi phi ghi qua HTTP.
    if (body.items.length > 0 && body.pageCursor) {
      const seenRes = await fetch(`${base}/api/feed/seen`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(jar.size ? { Cookie: cookieHeader() } : {})
        },
        body: JSON.stringify({
          ids: body.items.map((item) => item.id),
          cursor: body.pageCursor
        })
      });
      storeCookies(seenRes);
    }

    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }

  times.sort((a, b) => a - b);
  console.log(
    "HTTP crawl",
    JSON.stringify({
      pages: times.length,
      unique: seen.size,
      notices,
      p50: percentile(times, 0.5),
      p95: percentile(times, 0.95),
      max: times.at(-1).toFixed(3)
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

  if (process.argv.includes("--crawl")) {
    await httpCrawl(20, 50);
  }
}
