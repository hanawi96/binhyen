-- Migration number: 0018 	 2026-10-24T07:30:00.000Z

-- Chong trung bai theo tung nguoi xem.
-- Moi bai co mot so thu tu co dinh (seq) lam vi tri bit trong bitmap da xem.
-- Moi nguoi xem chi mot dong trang thai: it luot ghi, doc mot dong moi trang.

-- 1. So thu tu co dinh cua bai. 0 la dau "chua gan".
ALTER TABLE contents
ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;

-- Bo dem rieng de seq khong bao gio duoc dung lai khi bai bi xoa;
-- dung lai thi bai moi se bi coi la da xem.
CREATE TABLE IF NOT EXISTS content_seq_counter (
  id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
  last_seq INTEGER NOT NULL CHECK (last_seq >= 0)
);

UPDATE contents
SET seq = numbered.n
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
  FROM contents
) AS numbered
WHERE contents.id = numbered.id;

INSERT OR IGNORE INTO content_seq_counter (id, last_seq)
SELECT 1, COALESCE(MAX(seq), 0) FROM contents;

CREATE TRIGGER IF NOT EXISTS contents_seq_fill
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_contents_seq
ON contents(seq)
WHERE seq > 0;


-- 2. Trang thai feed cua moi nguoi xem.
-- viewer_key: 'u:<user_id>' khi dang nhap, 'a:<actor_id>' khi an danh.
-- seen_bits: bit thu seq bat = da xem; byte k chua bai seq 8k..8k+7.
-- positions_json: vi tri dang dung tren vong cho tung bo loc.
-- fresh_at: bai xuat ban sau moc nay duoc tron vao lan bai moi.
-- version: tang moi lan ghi, chong hai thiet bi ghi de nhau.
-- Khong them index updated_at: moi lan ghi se ton them mot dong index.
CREATE TABLE IF NOT EXISTS viewer_feed_state (
  viewer_key TEXT NOT NULL PRIMARY KEY CHECK (
    length(viewer_key) BETWEEN 18 AND 90
    AND (viewer_key GLOB 'u:*' OR viewer_key GLOB 'a:*')
  ),
  seen_bits BLOB NOT NULL DEFAULT x'' CHECK (
    typeof(seen_bits) = 'blob'
    AND length(seen_bits) <= 131072
  ),
  seen_count INTEGER NOT NULL DEFAULT 0 CHECK (seen_count >= 0),
  positions_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(positions_json)
    AND length(positions_json) <= 4096
  ),
  fresh_at INTEGER NOT NULL,
  loop_count INTEGER NOT NULL DEFAULT 0 CHECK (loop_count >= 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
