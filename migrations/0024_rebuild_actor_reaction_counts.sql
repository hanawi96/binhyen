-- Migration number: 0024 	 2026-10-25T08:00:00.000Z

-- Dong bo lai dem thich/luu: xoa bai (CASCADE) tung de dem orphancounter
-- cao hon so reaction gan bai published con song.

DELETE FROM actor_reaction_counts;

INSERT INTO actor_reaction_counts (
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
