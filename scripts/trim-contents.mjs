/**
 * Giữ lại KEEP bài trong contents (mặc định 500, mới nhất),
 * xóa phần còn lại — FK CASCADE dọn bảng con.
 *
 * Chỉ chạy D1 local:
 *   node scripts/trim-contents.mjs
 *   node scripts/trim-contents.mjs --keep=500
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

if (process.argv.includes("--remote")) {
  console.error("Từ chối: lệnh này chỉ ghi vào D1 local.");
  process.exit(1);
}

const keepArg = process.argv.find((a) => a.startsWith("--keep="));
const KEEP = Math.max(0, Number(keepArg?.slice("--keep=".length) ?? 500) || 500);

const { DatabaseSync } = await import("node:sqlite");
const db = openLiveDatabase();

try {
  db.exec("PRAGMA foreign_keys = ON");

  const before = db.prepare(`SELECT COUNT(*) AS n FROM contents`).get().n;
  console.log(`Trước: ${before} bài. Giữ lại: ${KEEP}.`);

  if (before <= KEEP) {
    console.log("Không cần xóa.");
    process.exit(0);
  }

  db.exec("BEGIN");
  try {
    // Giữ 500 mới nhất theo published_at / created_at.
    const deleted = db
      .prepare(
        `DELETE FROM contents
         WHERE id NOT IN (
           SELECT id FROM (
             SELECT id FROM contents
             ORDER BY COALESCE(published_at, created_at) DESC, id DESC
             LIMIT ?
           )
         )`
      )
      .run(KEEP);

    db.exec("COMMIT");

    const after = db.prepare(`SELECT COUNT(*) AS n FROM contents`).get().n;
    const details = db
      .prepare(`SELECT COUNT(*) AS n FROM content_details`)
      .get().n;

    console.log(`Đã xóa: ${deleted.changes} bài.`);
    console.log(`Sau: ${after} bài (content_details: ${details}).`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  try {
    db.exec("VACUUM");
    console.log("VACUUM xong.");
  } catch (error) {
    console.warn("VACUUM bỏ qua:", error.message);
  }
} finally {
  db.close();
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
