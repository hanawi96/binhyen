-- Migration number: 0003 	 2026-10-23T06:20:00.000Z

-- Ghi lai moi lan doi trang thai noi dung.
-- Khong luu token quan tri.

CREATE TABLE IF NOT EXISTS content_status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  created_at INTEGER NOT NULL,

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_status_events_content
ON content_status_events(content_id, id DESC);
