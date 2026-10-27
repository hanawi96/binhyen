-- Migration number: 0028 	 2026-10-27T04:45:00.000Z

-- Sua lech dem sau mergeActor (truoc day chuyen content_reactions
-- ma khong cap nhat actor_reaction_counts).

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
