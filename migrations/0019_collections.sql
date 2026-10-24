-- Migration number: 0019 	 2026-10-24T09:00:00.000Z

-- Bo suu tap bien tap: thanh vien M:N, thu tu co dinh.

CREATE TABLE IF NOT EXISTS collections (
  id TEXT NOT NULL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (
    length(slug) BETWEEN 1 AND 80
  ),
  title TEXT NOT NULL CHECK (
    length(title) BETWEEN 1 AND 120
  ),
  description TEXT NOT NULL DEFAULT '' CHECK (
    length(description) <= 400
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_collections_public
ON collections(status, sort_order, published_at, id);

CREATE TABLE IF NOT EXISTS collection_contents (
  collection_id TEXT NOT NULL,
  content_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (collection_id, content_id),

  FOREIGN KEY (collection_id)
    REFERENCES collections(id)
    ON DELETE CASCADE,

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collection_contents_order
ON collection_contents(collection_id, sort_order, content_id);

CREATE INDEX IF NOT EXISTS idx_collection_contents_content
ON collection_contents(content_id, collection_id);
