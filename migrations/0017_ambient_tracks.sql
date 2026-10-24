-- Migration number: 0017 	 2026-10-24T06:30:00.000Z

-- Danh sach nhac nen ambient (file tren R2, URL /api/media/audio/...).

CREATE TABLE ambient_tracks (
  id TEXT NOT NULL PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  url TEXT NOT NULL CHECK (length(url) BETWEEN 8 AND 500),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE INDEX ambient_tracks_sort_idx
  ON ambient_tracks (sort_order ASC, created_at ASC);
