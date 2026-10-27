-- Bo loc danh sach admin theo dang (format) + sap xep updated_at.
-- Bo sung cho cac index status/updated/created da co.

CREATE INDEX IF NOT EXISTS idx_contents_admin_format_updated
ON contents(format, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contents_admin_status_format_updated
ON contents(status, format, updated_at DESC, id DESC);
