-- Khoa mem tai khoan nguoi dung san pham (active | disabled).

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'disabled'));

CREATE INDEX IF NOT EXISTS idx_users_admin_created
ON users(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_users_admin_status_created
ON users(status, created_at DESC, id DESC);
