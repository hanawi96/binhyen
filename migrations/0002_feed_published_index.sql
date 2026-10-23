-- Migration number: 0002 	 2026-10-22T12:05:00.000Z

-- Feed sap published_at DESC, id DESC.
-- Index 0001 de id tang dan nen SQLite phai sap lai cot cuoi.
-- Thay bang index cung chieu voi ORDER BY. Khong doi du lieu.

DROP INDEX IF EXISTS idx_contents_public_feed;

CREATE INDEX idx_contents_public_feed
ON contents(status, published_at DESC, id DESC);
