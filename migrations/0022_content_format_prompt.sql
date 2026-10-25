-- Migration number: 0022 	 2026-10-25T06:30:00.000Z

-- Them dinh dang 'prompt' (cau hoi phan tu). SQLite khong sua CHECK cot
-- bang ALTER — tao bang moi, copy, doi ten, tao lai index + trigger.

PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS contents_rank_key_fill;
DROP TRIGGER IF EXISTS contents_seq_fill;

CREATE TABLE contents_new (
  id TEXT NOT NULL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,

  kind TEXT NOT NULL CHECK (
    kind IN (
      'quote', 'story', 'fact', 'insight',
      'psychology', 'cute', 'tip'
    )
  ),

  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'published', 'archived')
  ),

  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',

  theme TEXT NOT NULL CHECK (
    theme IN (
      'peace', 'discovery', 'story',
      'nature', 'psychology', 'cute'
    )
  ),

  source_label TEXT,
  source_url TEXT,

  normalized_hash TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER,

  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,

  rank_key INTEGER NOT NULL DEFAULT 0,

  format TEXT NOT NULL DEFAULT 'text' CHECK (
    format IN ('text', 'image', 'video', 'poll', 'prompt')
  ),

  seq INTEGER NOT NULL DEFAULT 0
);

INSERT INTO contents_new (
  id, slug, kind, status, category, title, description, tag,
  theme, source_label, source_url, normalized_hash,
  created_at, updated_at, published_at, author_id,
  rank_key, format, seq
)
SELECT
  id, slug, kind, status, category, title, description, tag,
  theme, source_label, source_url, normalized_hash,
  created_at, updated_at, published_at, author_id,
  rank_key, format, seq
FROM contents;

DROP TABLE contents;
ALTER TABLE contents_new RENAME TO contents;

CREATE INDEX idx_contents_public_feed
ON contents(status, published_at DESC, id DESC);

CREATE UNIQUE INDEX idx_contents_normalized_hash
ON contents(normalized_hash)
WHERE normalized_hash IS NOT NULL;

CREATE INDEX idx_contents_admin_status
ON contents(status, updated_at DESC, id DESC);

CREATE INDEX idx_contents_admin_updated
ON contents(updated_at DESC, id DESC);

CREATE INDEX idx_contents_admin_created
ON contents(created_at DESC, id DESC);

CREATE INDEX idx_contents_author
ON contents(author_id, created_at DESC, id DESC)
WHERE author_id IS NOT NULL;

CREATE INDEX idx_contents_public_rank
ON contents(status, rank_key, id);

CREATE UNIQUE INDEX idx_contents_seq
ON contents(seq)
WHERE seq > 0;

CREATE TRIGGER contents_rank_key_fill
AFTER INSERT ON contents
WHEN NEW.rank_key = 0
BEGIN
  UPDATE contents
  SET rank_key = random() & 2147483647
  WHERE id = NEW.id;
END;

CREATE TRIGGER contents_seq_fill
AFTER INSERT ON contents
WHEN NEW.seq = 0
BEGIN
  UPDATE content_seq_counter
  SET last_seq = last_seq + 1
  WHERE id = 1;

  UPDATE contents
  SET seq = (SELECT last_seq FROM content_seq_counter WHERE id = 1)
  WHERE id = NEW.id;
END;

PRAGMA foreign_keys = ON;
