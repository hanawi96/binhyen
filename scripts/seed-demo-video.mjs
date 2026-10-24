import { readdirSync } from "node:fs";
import { join } from "node:path";

if (process.argv.includes("--remote")) {
  console.error("Tu choi: chi ghi vao D1 local.");
  process.exit(1);
}

const VIDEO_ID = "viddemo001";
/** Clip CC0 nhe tu MDN — HTTPS, phu hop the feed. */
const VIDEO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
const POSTER_URL =
  "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=720&q=50";
const { DatabaseSync } = await import("node:sqlite");
const db = openLiveDatabase();

try {
  db.exec("PRAGMA busy_timeout = 8000");
  db.exec("PRAGMA foreign_keys = ON");

  if (process.argv.includes("--cleanup")) {
    removeVideo(db);
    console.log(JSON.stringify({ removed: true, id: VIDEO_ID }));
  } else {
    seed(db);
    console.log(JSON.stringify({ seeded: true, id: VIDEO_ID }));
  }
} finally {
  db.close();
}

function seed(db) {
  const now = Math.floor(Date.now() / 1000);
  db.exec("BEGIN");

  try {
    removeVideo(db);
    db.prepare(
      `INSERT INTO contents (
         id, slug, format, kind, status, category, title, description, tag,
         theme, source_label, created_at, updated_at, published_at, rank_key
       ) VALUES (
         ?1, 'gio-qua-canh-hoa', 'video', 'story', 'published',
         'Thiên nhiên kỳ thú',
         'Đôi khi chỉ cần nhìn hoa lay một lúc.',
         '', '', 'nature', 'Bình Yên',
         ?2, ?2, ?2, 1000002
       )`
    ).run(VIDEO_ID, now);

    db.prepare(
      `INSERT INTO content_topics (content_id, topic_slug) VALUES (?1, 'nature')`
    ).run(VIDEO_ID);
    db.prepare(
      `INSERT INTO content_moods (content_id, mood_slug) VALUES (?1, 'calm')`
    ).run(VIDEO_ID);
    db.prepare(
      `INSERT INTO content_media (
         content_id, kind, url, alt, poster_url, width, height
       ) VALUES (?1, 'video', ?2, ?3, ?4, ?5, ?6)`
    ).run(
      VIDEO_ID,
      VIDEO_URL,
      "Hoa lay trong gió nhẹ",
      POSTER_URL,
      1280,
      720
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function removeVideo(db) {
  db.prepare(`DELETE FROM content_media WHERE content_id = ?1`).run(VIDEO_ID);
  db.prepare(`DELETE FROM content_topics WHERE content_id = ?1`).run(VIDEO_ID);
  db.prepare(`DELETE FROM content_moods WHERE content_id = ?1`).run(VIDEO_ID);
  db.prepare(`DELETE FROM content_details WHERE content_id = ?1`).run(VIDEO_ID);
  db.prepare(`DELETE FROM contents WHERE id = ?1`).run(VIDEO_ID);
}

function openLiveDatabase() {
  const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const files = readdirSync(directory).filter((name) =>
    name.endsWith(".sqlite")
  );
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

  if (!chosen) throw new Error("Khong tim thay bang contents.");
  return chosen;
}
