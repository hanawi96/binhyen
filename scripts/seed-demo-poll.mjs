import { readdirSync } from "node:fs";
import { join } from "node:path";

if (process.argv.includes("--remote")) {
  console.error("Tu choi: chi ghi vao D1 local.");
  process.exit(1);
}

const POLL_ID = "polldemo01";
const { DatabaseSync } = await import("node:sqlite");
const db = openLiveDatabase();

try {
  db.exec("PRAGMA busy_timeout = 8000");
  db.exec("PRAGMA foreign_keys = ON");

  if (process.argv.includes("--cleanup")) {
    removePoll(db);
    console.log(JSON.stringify({ removed: true, id: POLL_ID }));
  } else {
    seed(db);
    console.log(JSON.stringify({ seeded: true, id: POLL_ID }));
  }
} finally {
  db.close();
}

function seed(db) {
  const now = Math.floor(Date.now() / 1000);
  db.exec("BEGIN");

  try {
    removePoll(db);
    db.prepare(
      `INSERT INTO contents (
         id, slug, format, kind, status, category, title, description, tag,
         theme, source_label, created_at, updated_at, published_at, rank_key
       ) VALUES (
         ?1, 'khao-sat-hom-nay-ban-the-nao', 'poll', 'story', 'published',
         'Chữa lành & bình yên',
         'Hôm nay lòng bạn đang nghiêng về phía nào?',
         '', '', 'peace', 'Bình Yên',
         ?2, ?2, ?2, 1000000
       )`
    ).run(POLL_ID, now);

    db.prepare(
      `INSERT INTO content_topics (content_id, topic_slug) VALUES (?1, 'peace')`
    ).run(POLL_ID);
    db.prepare(
      `INSERT INTO content_moods (content_id, mood_slug) VALUES (?1, 'calm')`
    ).run(POLL_ID);

    const options = ["Êm dịu", "Hơi mệt", "Nhẹ nhàng vui", "Cần một khoảng lặng"];
    const insert = db.prepare(
      `INSERT INTO poll_options (content_id, option_id, label, sort_order)
       VALUES (?1, ?2, ?3, ?4)`
    );

    options.forEach((label, index) => {
      insert.run(POLL_ID, `o${index + 1}`, label, index);
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function removePoll(db) {
  db.prepare(`DELETE FROM poll_votes WHERE content_id = ?1`).run(POLL_ID);
  db.prepare(`DELETE FROM poll_options WHERE content_id = ?1`).run(POLL_ID);
  db.prepare(`DELETE FROM content_topics WHERE content_id = ?1`).run(POLL_ID);
  db.prepare(`DELETE FROM content_moods WHERE content_id = ?1`).run(POLL_ID);
  db.prepare(`DELETE FROM content_details WHERE content_id = ?1`).run(POLL_ID);
  db.prepare(`DELETE FROM contents WHERE id = ?1`).run(POLL_ID);
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
