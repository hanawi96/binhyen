-- Migration number: 0016 	 2026-10-24T05:00:00.000Z

-- Mo rong content_media: kind video + poster_url (anh xem truoc, khong bat R2).

PRAGMA foreign_keys = OFF;

CREATE TABLE content_media_new (
  content_id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'video')),
  url TEXT NOT NULL CHECK (length(url) BETWEEN 8 AND 500),
  alt TEXT NOT NULL DEFAULT '' CHECK (length(alt) <= 200),
  poster_url TEXT CHECK (
    poster_url IS NULL OR length(poster_url) BETWEEN 8 AND 500
  ),
  width INTEGER CHECK (width IS NULL OR (width >= 1 AND width <= 10000)),
  height INTEGER CHECK (height IS NULL OR (height >= 1 AND height <= 10000)),

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE
);

INSERT INTO content_media_new (
  content_id, kind, url, alt, poster_url, width, height
)
SELECT content_id, kind, url, alt, NULL, width, height
FROM content_media;

DROP TABLE content_media;
ALTER TABLE content_media_new RENAME TO content_media;

PRAGMA foreign_keys = ON;
