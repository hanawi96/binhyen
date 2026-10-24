-- Migration number: 0007 	 2026-10-23T16:50:00.000Z

-- Tai khoan nguoi dung va phien dang nhap.
-- Mat khau chi luu ban bam PBKDF2; phien chi luu ban bam cua token.

CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  email TEXT NOT NULL COLLATE NOCASE CHECK (
    length(email) BETWEEN 3 AND 254
  ),
  display_name TEXT NOT NULL CHECK (
    length(display_name) BETWEEN 1 AND 60
  ),
  password_hash TEXT NOT NULL CHECK (length(password_hash) BETWEEN 40 AND 200),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT NOT NULL PRIMARY KEY CHECK (length(token_hash) = 64),
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
ON user_sessions(user_id, expires_at);
