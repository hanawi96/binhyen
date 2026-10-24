import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const databaseName = "binhyen-db";

if (process.argv.includes("--remote")) {
  console.error("Tu choi: lenh nay chi sao luu D1 local.");
  process.exit(1);
}

const { DatabaseSync } = await import("node:sqlite");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = join("backups", `binhyen-local-${stamp}.sql`);

mkdirSync("backups", { recursive: true });

const command = `npx wrangler d1 export ${databaseName} --local --output "${output}" -y`;
const exported = spawnSync(command, {
  shell: true,
  stdio: "inherit"
});

if (exported.error) {
  console.error(exported.error.message);
}

if (exported.status !== 0) {
  process.exit(exported.status ?? 1);
}

const sql = readFileSync(output, "utf8");
const tempDir = tmpdir();
const restoredPath = join(tempDir, `binhyen-restore-${stamp}.sqlite`);
// Ban xuat cua wrangler khong xep bang theo khoa ngoai.
const restored = new DatabaseSync(restoredPath, {
  enableForeignKeyConstraints: false
});
let liveDatabase;

try {
  restored.exec(sql);
  liveDatabase = openLiveDatabase();

  const snapshot = summarize(restored);
  const live = summarize(liveDatabase);

  if (
    snapshot.publishedDemo !== 6 ||
    snapshot.feedIndex !== "idx_contents_public_feed" ||
    snapshot.contents !== live.contents ||
    snapshot.topics !== live.topics ||
    snapshot.moods !== live.moods ||
    snapshot.statusEvents !== live.statusEvents ||
    live.bench !== 0
  ) {
    throw new Error("Ban sao khong khop voi co so du lieu local.");
  }

  console.log(
    JSON.stringify({
      file: output,
      bytes: Buffer.byteLength(sql),
      restored: snapshot,
      live
    })
  );
} finally {
  restored.close();
  liveDatabase?.close();
  rmSync(restoredPath, { force: true });
  rmSync(`${restoredPath}-wal`, { force: true });
  rmSync(`${restoredPath}-shm`, { force: true });
}

function summarize(db) {
  const demo = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM contents
       WHERE id IN ('1', '2', '3', '4', '5', '6')
         AND status = 'published'`
    )
    .get();
  const feedIndex = db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'index'
         AND name = 'idx_contents_public_feed'`
    )
    .get();
  const bench = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM contents
       WHERE id GLOB 'bench[0-9]*'`
    )
    .get();

  return {
    contents: count(db, "contents"),
    topics: count(db, "topics"),
    moods: count(db, "moods"),
    statusEvents: count(db, "content_status_events"),
    publishedDemo: demo.n,
    bench: bench.n,
    feedIndex: feedIndex?.name ?? null
  };
}

function openLiveDatabase() {
  const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const file = readdirSync(directory).find((name) => name.endsWith(".sqlite"));

  if (!file) {
    throw new Error("Khong tim thay file D1 local.");
  }

  return new DatabaseSync(join(directory, file), { readOnly: true });
}

function count(db, table) {
  const allowed = new Set([
    "contents",
    "topics",
    "moods",
    "content_status_events"
  ]);

  if (!allowed.has(table)) {
    throw new Error("Bang khong nam trong ban sao.");
  }

  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
  return row.n;
}
