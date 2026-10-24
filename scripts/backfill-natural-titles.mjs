/**
 * Thay tiêu đề giả (Bai do N / Châm ngôn N: …) bằng câu nói / châm ngôn tự nhiên.
 * Chỉ chạy D1 local:
 *   node scripts/backfill-natural-titles.mjs
 *   node scripts/backfill-natural-titles.mjs --dry-run
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pickDescription, pickTitle } from "./lib/natural-titles.mjs";

if (process.argv.includes("--remote")) {
  console.error("Từ chối: lệnh này chỉ ghi vào D1 local.");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const { DatabaseSync } = await import("node:sqlite");
const db = openLiveDatabase();

try {
  db.exec("PRAGMA busy_timeout = 8000");
  db.exec("PRAGMA foreign_keys = ON");

  const rows = db
    .prepare(
      `SELECT id, theme, title, description
       FROM contents
       WHERE id LIKE 'demo%'
          OR id GLOB 'bench[0-9]*'
          OR title GLOB 'Bai do *'
       ORDER BY id`
    )
    .all();

  console.log(`Cần sửa: ${rows.length} bài.${dryRun ? " (dry-run)" : ""}`);

  if (rows.length === 0) {
    process.exit(0);
  }

  const update = db.prepare(
    `UPDATE contents
     SET title = ?, description = ?, updated_at = ?
     WHERE id = ?`
  );

  const now = Math.floor(Date.now() / 1000);
  const used = new Set();
  let updated = 0;
  const samples = [];

  if (!dryRun) db.exec("BEGIN");

  try {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      let title = pickTitle(row.theme, i);
      let guard = 0;

      // Tránh trùng trong cùng lần chạy khi pool nhỏ hơn số hàng.
      while (used.has(title) && guard < 20) {
        title = pickTitle(row.theme, i + guard * 17 + 3);
        guard += 1;
      }
      used.add(title);

      const description = pickDescription(title, row.theme);

      if (!dryRun) {
        update.run(title, description, now, row.id);
      }

      updated += 1;
      if (samples.length < 8) {
        samples.push({ id: row.id, from: row.title, to: title });
      }
    }

    if (!dryRun) db.exec("COMMIT");
  } catch (error) {
    if (!dryRun) db.exec("ROLLBACK");
    throw error;
  }

  const remaining = db
    .prepare(
      `SELECT COUNT(*) AS n FROM contents
       WHERE title GLOB 'Bai do *'
          OR (
            title LIKE '%: %'
            AND (
              title GLOB 'Châm ngôn *'
              OR title GLOB 'Câu chuyện *'
              OR title GLOB 'Kiến thức *'
              OR title GLOB 'Góc nhìn *'
              OR title GLOB 'Tâm lý *'
              OR title GLOB 'Điều dễ thương *'
              OR title GLOB 'Mẹo *'
            )
          )`
    )
    .get();

  console.log(
    JSON.stringify(
      {
        updated,
        dryRun,
        fakeRemaining: remaining.n,
        samples
      },
      null,
      2
    )
  );
} finally {
  db.close();
}

function openLiveDatabase() {
  const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const files = readdirSync(directory).filter((name) =>
    name.endsWith(".sqlite")
  );

  if (files.length === 0) {
    throw new Error("Không tìm thấy file D1 local.");
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

    const size = candidate.prepare(`SELECT COUNT(*) AS n FROM contents`).get();

    if (size.n > chosenCount) {
      chosen?.close();
      chosen = candidate;
      chosenCount = size.n;
    } else {
      candidate.close();
    }
  }

  if (!chosen) throw new Error("Không tìm thấy bảng contents.");
  return chosen;
}
