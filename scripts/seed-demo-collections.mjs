import { readdirSync } from "node:fs";
import { join } from "node:path";

if (process.argv.includes("--remote")) {
  console.error("Tu choi: chi ghi vao D1 local.");
  process.exit(1);
}

const { DatabaseSync } = await import("node:sqlite");
const db = openLiveDatabase();

const COL_A = "kdemo000000000001";
const COL_B = "kdemo000000000002";

try {
  db.exec("PRAGMA busy_timeout = 8000");
  db.exec("PRAGMA foreign_keys = ON");

  if (process.argv.includes("--cleanup")) {
    cleanup(db);
    console.log(JSON.stringify({ removed: true }));
  } else {
    seed(db);
    console.log(
      JSON.stringify({
        seeded: true,
        collections: [
          { id: COL_A, slug: "100-cau-dong-luc" },
          { id: COL_B, slug: "binh-yen-moi-ngay" }
        ]
      })
    );
  }
} finally {
  db.close();
}

function seed(db) {
  const now = Math.floor(Date.now() / 1000);
  db.exec("BEGIN");

  try {
    cleanup(db);

    db.prepare(
      `INSERT INTO collections (
         id, slug, title, description, status, sort_order,
         created_at, updated_at, published_at
       ) VALUES
         (?1, '100-cau-dong-luc', '100 câu nói động lực',
          'Những câu ngắn để đứng dậy nhẹ nhàng.', 'published', 0, ?3, ?3, ?3),
         (?2, 'binh-yen-moi-ngay', 'Bình yên mỗi ngày',
          'Một khoảng lặng cho tâm hồn.', 'published', 1, ?3, ?3, ?3)`
    ).run(COL_A, COL_B, now);

    const published = db
      .prepare(
        `SELECT id FROM contents
         WHERE status = 'published' AND published_at IS NOT NULL
         ORDER BY published_at DESC, id ASC
         LIMIT 24`
      )
      .all();

    const insert = db.prepare(
      `INSERT OR IGNORE INTO collection_contents (collection_id, content_id, sort_order)
       VALUES (?1, ?2, ?3)`
    );

    published.forEach((row, index) => {
      if (index % 2 === 0) insert.run(COL_A, row.id, Math.floor(index / 2));
      else insert.run(COL_B, row.id, Math.floor(index / 2));
    });

    // Gan them demo media/poll neu co.
    for (const id of ["imgdemo001", "viddemo001", "polldemo01"]) {
      const exists = db
        .prepare(`SELECT id FROM contents WHERE id = ?1`)
        .get(id);
      if (exists) insert.run(COL_B, id, 100 + id.length);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function cleanup(db) {
  db.prepare(`DELETE FROM collection_contents WHERE collection_id IN (?, ?)`).run(
    COL_A,
    COL_B
  );
  db.prepare(`DELETE FROM collections WHERE id IN (?, ?)`).run(COL_A, COL_B);
}

function openLiveDatabase() {
  const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const files = readdirSync(directory).filter((name) => name.endsWith(".sqlite"));
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

    const size = candidate.prepare(`SELECT COUNT(*) AS n FROM contents`).get();
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
