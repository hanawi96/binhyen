import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("backups/sync-to-prod-data.sql", "utf8");
const lines = src.split(/\r?\n/);

const kept = lines.filter((line) => {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return !/INSERT INTO ["']?d1_migrations["']?/i.test(trimmed);
});

const wipe = [
  "PRAGMA defer_foreign_keys=TRUE;",
  "DELETE FROM poll_votes;",
  "DELETE FROM poll_options;",
  "DELETE FROM content_reactions;",
  "DELETE FROM content_shares;",
  "DELETE FROM content_stats;",
  "DELETE FROM content_status_events;",
  "DELETE FROM content_topics;",
  "DELETE FROM content_moods;",
  "DELETE FROM content_media;",
  "DELETE FROM content_details;",
  "DELETE FROM collection_contents;",
  "DELETE FROM collections;",
  "DELETE FROM ambient_tracks;",
  "DELETE FROM viewer_feed_state;",
  "DELETE FROM user_topics;",
  "DELETE FROM user_sessions;",
  "DELETE FROM users;",
  "DELETE FROM actors;",
  "DELETE FROM contents;",
  "DELETE FROM content_seq_counter;",
  "DELETE FROM topics;",
  "DELETE FROM moods;"
];

const body = kept.filter((line) => !line.startsWith("PRAGMA defer_foreign_keys"));
const out = [...wipe, ...body, ""].join("\n");
writeFileSync("backups/sync-to-prod-import.sql", out, "utf8");

console.log(
  JSON.stringify(
    {
      srcLines: lines.length,
      outLines: out.split(/\n/).length,
      bytes: Buffer.byteLength(out),
      hasMigrations: out.includes("d1_migrations"),
      topicInserts: (out.match(/INSERT INTO "topics"/g) || []).length,
      contentInserts: (out.match(/INSERT INTO "contents"/g) || []).length
    },
    null,
    2
  )
);
