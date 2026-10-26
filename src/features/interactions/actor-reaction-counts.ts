/**
 * Dong bo actor_reaction_counts khi bai roi khoi / vao published,
 * hoac truoc khi xoa bai (CASCADE xoa reaction nhung khong tru dem).
 */

type Direction = "enter" | "leave";

/** +1 khi vao published, -1 khi roi published / sap xoa. */
export async function adjustActorCountsForContent(
  db: D1Database,
  contentId: string,
  direction: Direction
): Promise<void> {
  const step = direction === "enter" ? 1 : -1;
  const { results } = await db
    .prepare(
      `SELECT actor_id, kind
       FROM content_reactions
       WHERE content_id = ?1
         AND kind IN ('like', 'save')`
    )
    .bind(contentId)
    .all<{ actor_id: string; kind: string }>();

  if (!results.length) return;

  const now = Math.floor(Date.now() / 1000);
  const statements = results.map((row) => {
    if (step > 0) {
      return db
        .prepare(
          `INSERT INTO actor_reaction_counts
             (actor_id, liked_count, saved_count, updated_at)
           VALUES (
             ?1,
             CASE WHEN ?2 = 'like' THEN 1 ELSE 0 END,
             CASE WHEN ?2 = 'save' THEN 1 ELSE 0 END,
             ?3
           )
           ON CONFLICT (actor_id) DO UPDATE SET
             liked_count = liked_count + excluded.liked_count,
             saved_count = saved_count + excluded.saved_count,
             updated_at = excluded.updated_at`
        )
        .bind(row.actor_id, row.kind, now);
    }

    return db
      .prepare(
        `UPDATE actor_reaction_counts
         SET
           liked_count = CASE
             WHEN ?2 = 'like' AND liked_count > 0 THEN liked_count - 1
             ELSE liked_count
           END,
           saved_count = CASE
             WHEN ?2 = 'save' AND saved_count > 0 THEN saved_count - 1
             ELSE saved_count
           END,
           updated_at = ?3
         WHERE actor_id = ?1`
      )
      .bind(row.actor_id, row.kind, now);
  });

  await db.batch(statements);
}

/** Dem dung bang danh sach: chi reaction gan bai dang published. */
export async function countPublishedReactions(
  db: D1Database,
  actorId: string
): Promise<{ liked: number; saved: number }> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(r.kind = 'like'), 0) AS liked,
         COALESCE(SUM(r.kind = 'save'), 0) AS saved
       FROM content_reactions r
       JOIN contents c
         ON c.id = r.content_id AND c.status = 'published'
       WHERE r.actor_id = ?1`
    )
    .bind(actorId)
    .first<{ liked: number; saved: number }>();

  return {
    liked: Number(row?.liked) || 0,
    saved: Number(row?.saved) || 0
  };
}
