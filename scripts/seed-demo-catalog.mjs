import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pickDescription, pickTitle } from "./lib/natural-titles.mjs";

const perTopic = 50;

const topics = [
  { slug: "peace", label: "bình yên", category: "Chữa lành & bình yên", theme: "peace", tag: "Đi chậm" },
  { slug: "stories", label: "câu chuyện", category: "Góc nhìn cuộc sống", theme: "story", tag: "Một câu chuyện" },
  { slug: "science", label: "khoa học", category: "Kiến thức kỳ thú", theme: "discovery", tag: "Khám phá" },
  { slug: "nature", label: "thiên nhiên", category: "Thiên nhiên kỳ thú", theme: "nature", tag: "Tự nhiên" },
  { slug: "psychology", label: "tâm lý", category: "Tâm lý học dễ hiểu", theme: "psychology", tag: "Hiểu mình" },
  { slug: "perspective", label: "góc nhìn", category: "Góc nhìn cuộc sống", theme: "story", tag: "Một góc nhìn" },
  { slug: "cute", label: "điều dễ thương", category: "Những điều dễ thương", theme: "cute", tag: "Niềm vui nhỏ" },
  { slug: "tips", label: "mẹo nhỏ", category: "Kiến thức kỳ thú", theme: "discovery", tag: "Mẹo hữu ích" }
];

const moods = [
  { slug: "calm", label: "êm" },
  { slug: "tired", label: "mệt" },
  { slug: "stressed", label: "căng" },
  { slug: "sad", label: "buồn" },
  { slug: "happy", label: "vui" },
  { slug: "curious", label: "tò mò" }
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

if (process.argv.includes("--remote")) {
  console.error("Tu choi: chi ghi vao D1 local.");
  process.exit(1);
}

const { DatabaseSync } = await import("node:sqlite");
const db = openLiveDatabase();

try {
  db.exec("PRAGMA busy_timeout = 8000");

  if (process.argv.includes("--cleanup")) {
    removeDemo(db);
    console.log(JSON.stringify({ removed: true, ...report(db) }));
  } else {
    seed(db);
    console.log(JSON.stringify(report(db)));
  }
} finally {
  db.close();
}

function seed(db) {
  const oldest = db
    .prepare(
      `SELECT MIN(published_at) AS n
       FROM contents
       WHERE id NOT LIKE 'demo%'
         AND published_at IS NOT NULL`
    )
    .get();
  const anchor = (oldest?.n ?? Math.floor(Date.now() / 1000)) - 1;
  const posts = buildPosts(anchor);

  db.exec("BEGIN");

  try {
    removeDemo(db);
    const insertContent = db.prepare(
      `INSERT INTO contents (
         id, slug, kind, status, category, title, description, tag, theme,
         source_label, normalized_hash, created_at, updated_at, published_at
       ) VALUES (?, ?, ?, 'published', ?, ?, ?, ?, ?, 'Bài demo local', ?, ?, ?, ?)`
    );
    const insertDetail = db.prepare(
      `INSERT INTO content_details (content_id, body_markdown, reading_minutes)
       VALUES (?, ?, 1)`
    );
    const insertTopic = db.prepare(
      `INSERT INTO content_topics (content_id, topic_slug) VALUES (?, ?)`
    );
    const insertMood = db.prepare(
      `INSERT INTO content_moods (content_id, mood_slug) VALUES (?, ?)`
    );

    for (const post of posts) {
      insertContent.run(
        post.id,
        post.slug,
        post.kind,
        post.category,
        post.title,
        post.description,
        post.tag,
        post.theme,
        post.hash,
        post.at,
        post.at,
        post.at
      );
      insertDetail.run(post.id, post.body);
      insertTopic.run(post.id, post.topic);
      insertMood.run(post.id, post.mood);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function removeDemo(db) {
  db.prepare(`DELETE FROM content_topics WHERE content_id LIKE 'demo%'`).run();
  db.prepare(`DELETE FROM content_moods WHERE content_id LIKE 'demo%'`).run();
  db.prepare(`DELETE FROM content_details WHERE content_id LIKE 'demo%'`).run();
  db.prepare(
    `DELETE FROM content_status_events WHERE content_id LIKE 'demo%'`
  ).run();
  db.prepare(`DELETE FROM contents WHERE id LIKE 'demo%'`).run();
}

function buildPosts(oldestDemoAt) {
  const posts = [];
  let serial = 0;

  for (const topic of topics) {
    for (let index = 1; index <= perTopic; index += 1) {
      serial += 1;
      const kind = kinds[(serial - 1) % kinds.length];
      const mood = moods[(serial - 1) % moods.length];
      const id = `demo${String(serial).padStart(4, "0")}`;
      const title = pickTitle(topic.theme, serial - 1);
      const description = pickDescription(title, topic.theme);
      const at = oldestDemoAt - serial;

      posts.push({
        id,
        slug: `demo-${topic.slug}-${String(index).padStart(2, "0")}`,
        kind,
        category: topic.category,
        title,
        description,
        tag: topic.tag,
        theme: topic.theme,
        topic: topic.slug,
        mood: mood.slug,
        hash: fingerprint([title, description]),
        body: `## ${title}\n\n${description}\n\nĐây là nội dung demo trên máy local, dùng để thử danh sách, bộ lọc và feed.`,
        at
      });
    }
  }

  return posts;
}

function fingerprint(parts) {
  const text = parts
    .map((part) =>
      part.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim()
    )
    .filter((part) => part.length > 0)
    .join("\n");

  return createHash("sha256").update(text).digest("hex");
}

function report(db) {
  const kept = db
    .prepare(
      `SELECT COUNT(*) AS n FROM contents WHERE id NOT LIKE 'demo%'`
    )
    .get();
  const demo = db
    .prepare(
      `SELECT COUNT(*) AS n FROM contents WHERE id LIKE 'demo%'`
    )
    .get();
  const byTopic = db
    .prepare(
      `SELECT topic_slug AS slug, COUNT(*) AS n
       FROM content_topics
       WHERE content_id LIKE 'demo%'
       GROUP BY topic_slug
       ORDER BY topic_slug`
    )
    .all();
  const byMood = db
    .prepare(
      `SELECT mood_slug AS slug, COUNT(*) AS n
       FROM content_moods
       WHERE content_id LIKE 'demo%'
       GROUP BY mood_slug
       ORDER BY mood_slug`
    )
    .all();
  const byKind = db
    .prepare(
      `SELECT kind, COUNT(*) AS n
       FROM contents
       WHERE id LIKE 'demo%'
       GROUP BY kind
       ORDER BY kind`
    )
    .all();

  return {
    kept: kept.n,
    demo: demo.n,
    byTopic,
    byMood,
    byKind
  };
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
        `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'contents'`
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
