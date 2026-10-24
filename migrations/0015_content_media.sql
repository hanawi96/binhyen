-- Migration number: 0015 	 2026-10-24T04:50:00.000Z

-- Media nhe cho the anh (va mo rong video sau).
-- Buoc nay luu URL HTTPS + alt + ti le; chua bat R2 upload.

CREATE TABLE IF NOT EXISTS content_media (
  content_id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image')),
  url TEXT NOT NULL CHECK (length(url) BETWEEN 8 AND 500),
  alt TEXT NOT NULL DEFAULT '' CHECK (length(alt) <= 200),
  width INTEGER CHECK (width IS NULL OR (width >= 1 AND width <= 10000)),
  height INTEGER CHECK (height IS NULL OR (height >= 1 AND height <= 10000)),

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE
);
