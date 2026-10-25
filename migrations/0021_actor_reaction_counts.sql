-- Migration number: 0021 	 2026-10-25T12:00:00.000Z

-- So dem thich / luu theo actor — tranh SUM toan bo moi lan mo "Cua toi".
-- Cap nhat cung batch react/unreact (chi khi bai published, giong INSERT reaction).

CREATE TABLE IF NOT EXISTS actor_reaction_counts (
  actor_id TEXT NOT NULL PRIMARY KEY CHECK (
    length(actor_id) BETWEEN 16 AND 80
  ),
  liked_count INTEGER NOT NULL DEFAULT 0 CHECK (liked_count >= 0),
  saved_count INTEGER NOT NULL DEFAULT 0 CHECK (saved_count >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR REPLACE INTO actor_reaction_counts (
  actor_id,
  liked_count,
  saved_count,
  updated_at
)
SELECT
  r.actor_id,
  COALESCE(SUM(r.kind = 'like'), 0),
  COALESCE(SUM(r.kind = 'save'), 0),
  unixepoch()
FROM content_reactions r
INNER JOIN contents c
  ON c.id = r.content_id AND c.status = 'published'
GROUP BY r.actor_id;
