-- Migration number: 0012 	 2026-10-24T01:20:00.000Z

-- So xao tron co dinh cua moi bai, dung lam thu tu vong tron cho feed.
-- Moi nguoi chi can luu vi tri tren vong, khong luu danh sach bai da xem.
-- ALTER TABLE khong cho DEFAULT ngau nhien nen dung 0 lam dau "chua gan"
-- va trigger gan so ngau nhien 31 bit ngay sau khi chen.

ALTER TABLE contents
ADD COLUMN rank_key INTEGER NOT NULL DEFAULT 0;

UPDATE contents
SET rank_key = random() & 2147483647;

CREATE TRIGGER IF NOT EXISTS contents_rank_key_fill
AFTER INSERT ON contents
WHEN NEW.rank_key = 0
BEGIN
  UPDATE contents
  SET rank_key = random() & 2147483647
  WHERE id = NEW.id;
END;

-- Feed cong khai: status = 'published' AND (rank_key, id) > (?, ?)
-- ORDER BY rank_key, id. Partial index khong duoc planner chon vi
-- idx_contents_admin_status co dieu kien bang tren status.
CREATE INDEX IF NOT EXISTS idx_contents_public_rank
ON contents(status, rank_key, id);
