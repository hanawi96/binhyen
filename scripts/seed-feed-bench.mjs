import { readdirSync } from "node:fs";
import { join } from "node:path";

const RANK_KEY_MAX = 2147483647;
const COUNT = readCount(20_000);

function readCount(fallback) {
  const arg = process.argv.find((item) => item.startsWith("--count="));
  if (!arg) return fallback;

  const value = Number(arg.slice("--count=".length));

  if (!Number.isSafeInteger(value) || value < 1 || value > 200_000) {
    throw new Error("--count phai la so nguyen 1..200000");
  }

  return value;
}

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
const moods = ["calm", "tired", "stressed", "sad", "happy", "curious"];
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

if (process.argv.includes("--remote")) {
  console.error("Tu choi: chi ghi vao D1 local.");
  process.exit(1);
}

const { DatabaseSync } = await import("node:sqlite");
const db = openLiveDatabase();

try {
  db.exec("PRAGMA busy_timeout = 8000");
  db.exec("PRAGMA foreign_keys = ON");

  if (process.argv.includes("--cleanup")) {
    const before = report(db);
    removeBench(db);
    console.log(JSON.stringify({ removed: true, before, after: report(db) }));
  } else {
    const before = report(db);
    seed(db);
    console.log(JSON.stringify({ seeded: true, before, after: report(db) }));
  }
} finally {
  db.close();
}

function idFor(n) {
  return `bench${String(n).padStart(8, "0")}`;
}

/** Tran deu tren [1, RANK_KEY_MAX] de scan vong gan nhu san xuat. */
function rankKeyFor(n) {
  return ((n * 2654435761) >>> 0) & RANK_KEY_MAX || 1;
}

function seed(db) {
  db.exec("BEGIN");

  try {
    removeBench(db);

    const insertContent = db.prepare(
      `INSERT INTO contents (
         id, slug, kind, status, category, title, description, tag, theme,
         source_label, created_at, updated_at, published_at, rank_key
       ) VALUES (
         ?, ?, ?, 'published', 'Bench', ?, ?, 'Bench', ?,
         'Bench local', ?, ?, ?, ?
       )`
    );
    const insertTopic = db.prepare(
      `INSERT INTO content_topics (content_id, topic_slug) VALUES (?, ?)`
    );
    const insertMood = db.prepare(
      `INSERT INTO content_moods (content_id, mood_slug) VALUES (?, ?)`
    );

    const now = Math.floor(Date.now() / 1000);
    // Phan lon bai cu; 40 bai moi nhat de thu cua so "Moi".
    const freshStart = COUNT - 39;

    for (let n = 1; n <= COUNT; n += 1) {
      const id = idFor(n);
      const kind = kinds[n % kinds.length];
      const theme = themes[n % themes.length];
      const publishedAt =
        n >= freshStart ? now - (COUNT - n) : 1_700_000_000 - n;

      insertContent.run(
        id,
        `bench-${n}`,
        kind,
        `Bai do ${n}`,
        `Mo ta do ${n}.`,
        theme,
        publishedAt,
        publishedAt,
        publishedAt,
        rankKeyFor(n)
      );
      insertTopic.run(id, topics[n % topics.length]);
      insertMood.run(id, moods[n % moods.length]);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function removeBench(db) {
  db.prepare(
    `DELETE FROM content_reactions WHERE content_id GLOB 'bench[0-9]*'`
  ).run();
  db.prepare(
    `DELETE FROM content_topics WHERE content_id GLOB 'bench[0-9]*'`
  ).run();
  db.prepare(
    `DELETE FROM content_moods WHERE content_id GLOB 'bench[0-9]*'`
  ).run();
  db.prepare(
    `DELETE FROM content_details WHERE content_id GLOB 'bench[0-9]*'`
  ).run();
  db.prepare(
    `DELETE FROM content_status_events WHERE content_id GLOB 'bench[0-9]*'`
  ).run();
  db.prepare(`DELETE FROM contents WHERE id GLOB 'bench[0-9]*'`).run();
}

function report(db) {
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM contents) AS contents,
         (SELECT COUNT(*) FROM contents WHERE id GLOB 'bench[0-9]*') AS bench,
         (SELECT COUNT(*) FROM contents WHERE id LIKE 'demo%') AS demo,
         (SELECT COUNT(*) FROM contents WHERE id IN ('1','2','3','4','5','6')) AS six,
         (SELECT COUNT(*) FROM contents WHERE status = 'published') AS published,
         (SELECT COUNT(*) FROM contents WHERE id GLOB 'bench[0-9]*' AND rank_key = 0) AS bench_zero_rank`
    )
    .get();
}

function openLiveDatabase() {
  const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const files = readdirSync(directory).filter((name) =>
    name.endsWith(".sqlite")
  );

  if (files.length === 0) {
    throw new Error("Khong tim thay file D1 local.");
  }

  let chosen = null;
  let chosenCount = -1;

  for (const file of files) {
    const candidate = new DatabaseSync(join(directory, file));
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

    if (size.n > chosenCount) {
      chosen?.close();
      chosen = candidate;
      chosenCount = size.n;
    } else {
      candidate.close();
    }
  }

  if (!chosen) {
    throw new Error("Khong tim thay bang contents trong D1 local.");
  }

  return chosen;
}
