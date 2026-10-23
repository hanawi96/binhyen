-- Danh sach quan tri: loc theo trang thai, sap theo ngay sua hoac ngay tao.
-- Khong dung cho feed cong khai.

CREATE INDEX IF NOT EXISTS idx_contents_admin_status
ON contents(status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contents_admin_updated
ON contents(updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contents_admin_created
ON contents(created_at DESC, id DESC);
