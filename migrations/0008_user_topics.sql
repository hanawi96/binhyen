-- Migration number: 0008 	 2026-10-24T00:10:00.000Z

-- Chu de nguoi dung chon trong ho so.

CREATE TABLE IF NOT EXISTS user_topics (
  user_id TEXT NOT NULL,
  topic_slug TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  PRIMARY KEY (user_id, topic_slug),

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  FOREIGN KEY (topic_slug)
    REFERENCES topics(slug)
    ON DELETE CASCADE
);
