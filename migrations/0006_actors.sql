-- Migration number: 0006 	 2026-10-23T16:20:00.000Z

-- Ma an danh cua moi trinh duyet, tao khi co thao tac dau tien.
-- user_id de trong cho toi khi co tai khoan.
-- Khong luu IP, email hay thong tin nhan dang.

CREATE TABLE IF NOT EXISTS actors (
  id TEXT NOT NULL PRIMARY KEY CHECK (
    length(id) BETWEEN 16 AND 80
  ),
  user_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Tim cac ma da gan voi mot tai khoan.
CREATE INDEX IF NOT EXISTS idx_actors_user
ON actors(user_id)
WHERE user_id IS NOT NULL;
