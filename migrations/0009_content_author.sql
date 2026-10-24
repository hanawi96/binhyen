-- Migration number: 0009 	 2026-10-24T00:20:00.000Z

-- Tac gia cua bai viet do nguoi dung tu viet.
-- NULL: bai do quan tri dang. Xoa tai khoan thi giu bai, chi bo lien ket.

ALTER TABLE contents
ADD COLUMN author_id TEXT
REFERENCES users(id) ON DELETE SET NULL;

-- Danh sach "Da viet": bai cua mot nguoi, moi nhat truoc.
CREATE INDEX IF NOT EXISTS idx_contents_author
ON contents(author_id, created_at DESC, id DESC)
WHERE author_id IS NOT NULL;
