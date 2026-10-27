-- Tai khoan quan tri (tach khoi users).
-- Mat khau: pbkdf2-sha256$...; phien chi luu hash token.

CREATE TABLE IF NOT EXISTS admins (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 80),
  username TEXT NOT NULL COLLATE NOCASE CHECK (
    length(username) BETWEEN 3 AND 40
  ),
  display_name TEXT NOT NULL CHECK (
    length(display_name) BETWEEN 1 AND 60
  ),
  password_hash TEXT NOT NULL CHECK (length(password_hash) BETWEEN 40 AND 200),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'disabled')
  ),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_username
ON admins(username);

CREATE INDEX IF NOT EXISTS idx_admins_status
ON admins(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT NOT NULL PRIMARY KEY CHECK (length(token_hash) = 64),
  admin_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,

  FOREIGN KEY (admin_id)
    REFERENCES admins(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin
ON admin_sessions(admin_id, expires_at);
