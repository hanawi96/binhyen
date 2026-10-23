-- Migration number: 0001 	 2026-10-22T09:54:25.563Z

-- Binh Yen - Content schema v1
-- Database: Cloudflare D1 (SQLite)
-- Chua tao bang nguoi dung hay du lieu tuong tac.

-- 1. Bang noi dung chinh
CREATE TABLE IF NOT EXISTS contents (
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
  published_at INTEGER
);

-- Ho tro lay noi dung da xuat ban
CREATE INDEX IF NOT EXISTS idx_contents_public_feed
ON contents(status, published_at DESC, id);

-- Chan trung noi dung da duoc chuan hoa
CREATE UNIQUE INDEX IF NOT EXISTS idx_contents_normalized_hash
ON contents(normalized_hash)
WHERE normalized_hash IS NOT NULL;


-- 2. Noi dung bai viet dai
CREATE TABLE IF NOT EXISTS content_details (
  content_id TEXT NOT NULL PRIMARY KEY,

  body_markdown TEXT NOT NULL,
  reading_minutes INTEGER NOT NULL DEFAULT 1
    CHECK (reading_minutes >= 1),

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE
);


-- 3. Danh muc chu de
CREATE TABLE IF NOT EXISTS topics (
  slug TEXT NOT NULL PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);


-- 4. Danh muc tam trang
CREATE TABLE IF NOT EXISTS moods (
  slug TEXT NOT NULL PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);


-- 5. Lien ket noi dung voi chu de
CREATE TABLE IF NOT EXISTS content_topics (
  content_id TEXT NOT NULL,
  topic_slug TEXT NOT NULL,

  PRIMARY KEY (content_id, topic_slug),

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE,

  FOREIGN KEY (topic_slug)
    REFERENCES topics(slug)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_content_topics_topic
ON content_topics(topic_slug, content_id);


-- 6. Lien ket noi dung voi tam trang
CREATE TABLE IF NOT EXISTS content_moods (
  content_id TEXT NOT NULL,
  mood_slug TEXT NOT NULL,

  PRIMARY KEY (content_id, mood_slug),

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE,

  FOREIGN KEY (mood_slug)
    REFERENCES moods(slug)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_content_moods_mood
ON content_moods(mood_slug, content_id);


-- 7. Khoi tao cac chu de mac dinh
INSERT OR IGNORE INTO topics (slug, label, sort_order)
VALUES
  ('peace', 'Bình yên', 1),
  ('stories', 'Câu chuyện', 2),
  ('science', 'Khoa học', 3),
  ('nature', 'Thiên nhiên', 4),
  ('psychology', 'Tâm lý học', 5),
  ('perspective', 'Góc nhìn cuộc sống', 6),
  ('cute', 'Điều dễ thương', 7),
  ('tips', 'Mẹo thú vị', 8);


-- 8. Khoi tao cac tam trang mac dinh
INSERT OR IGNORE INTO moods (slug, label, sort_order)
VALUES
  ('calm', 'Bình yên', 1),
  ('tired', 'Mệt mỏi', 2),
  ('stressed', 'Căng thẳng', 3),
  ('sad', 'Buồn', 4),
  ('happy', 'Vui vẻ', 5),
  ('curious', 'Tò mò', 6);
