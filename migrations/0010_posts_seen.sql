-- Migration number: 0010 	 2026-10-24T07:40:00.000Z

-- Lan cuoi nguoi viet xem "Da viet".
-- Ket qua duyet sau moc nay duoc bao la moi.

ALTER TABLE users ADD COLUMN posts_seen_at INTEGER NOT NULL DEFAULT 0;
