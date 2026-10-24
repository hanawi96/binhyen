-- Migration number: 0005 	 2026-10-23T16:15:00.000Z

-- Luot thich, luot luu va luot chia se cua noi dung.
-- actor_id la ma an danh cua trinh duyet; sau nay gan voi tai khoan.
-- Khong luu IP, email hay token.

-- 1. Thich va luu: moi nguoi chi mot lan cho moi bai.
CREATE TABLE IF NOT EXISTS content_reactions (
  content_id TEXT NOT NULL,
  actor_id TEXT NOT NULL CHECK (
    length(actor_id) BETWEEN 16 AND 80
  ),
  kind TEXT NOT NULL CHECK (kind IN ('like', 'save')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  PRIMARY KEY (content_id, actor_id, kind),

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE
);

-- Danh sach bai toi da thich / da luu, moi nhat truoc.
CREATE INDEX IF NOT EXISTS idx_content_reactions_actor
ON content_reactions(actor_id, kind, created_at DESC);


-- 2. Chia se: moi lan bam la mot dong.
CREATE TABLE IF NOT EXISTS content_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL,
  actor_id TEXT CHECK (
    actor_id IS NULL OR length(actor_id) BETWEEN 16 AND 80
  ),
  channel TEXT NOT NULL DEFAULT 'other' CHECK (
    channel IN ('native', 'copy_link', 'other')
  ),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_shares_content
ON content_shares(content_id, created_at DESC);


-- 3. So dem san cho moi bai, cap nhat cung lenh ghi o tren.
-- Bai chua co dong nao duoc xem la 0.
CREATE TABLE IF NOT EXISTS content_stats (
  content_id TEXT NOT NULL PRIMARY KEY,
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  save_count INTEGER NOT NULL DEFAULT 0 CHECK (save_count >= 0),
  share_count INTEGER NOT NULL DEFAULT 0 CHECK (share_count >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE
);

-- Muc "Yeu thich nhat".
CREATE INDEX IF NOT EXISTS idx_content_stats_likes
ON content_stats(like_count DESC, content_id DESC);
