import {
  buildPollState,
  type PollState,
  type PollStore
} from "./content-polls";

interface OptionRow {
  option_id: string;
  label: string;
  sort_order: number;
  votes: number;
}

/**
 * Doc / ghi phieu khao sat. Mot actor chi mot phieu / bai;
 * gui lai cung dap an van an toan, doi dap an bi tu choi.
 */
export function createD1PollStore(db: D1Database): PollStore {
  async function loadState(
    contentId: string,
    actorId: string | null
  ): Promise<PollState | null> {
    const published = await db
      .prepare(
        `SELECT 1 AS ok
         FROM contents
         WHERE id = ?1
           AND status = 'published'
           AND format = 'poll'`
      )
      .bind(contentId)
      .first<{ ok: number }>();

    if (!published) return null;

    const { results } = await db
      .prepare(
        `SELECT
           o.option_id,
           o.label,
           o.sort_order,
           (
             SELECT COUNT(*)
             FROM poll_votes v
             WHERE v.content_id = o.content_id
               AND v.option_id = o.option_id
           ) AS votes
         FROM poll_options o
         WHERE o.content_id = ?1
         ORDER BY o.sort_order, o.option_id`
      )
      .bind(contentId)
      .all<OptionRow>();

    if (results.length === 0) return null;

    let votedOptionId: string | null = null;

    if (actorId) {
      const vote = await db
        .prepare(
          `SELECT option_id
           FROM poll_votes
           WHERE content_id = ?1 AND actor_id = ?2`
        )
        .bind(contentId, actorId)
        .first<{ option_id: string }>();

      votedOptionId = vote?.option_id ?? null;
    }

    return buildPollState(
      results.map((row) => ({
        option_id: row.option_id,
        label: row.label,
        votes: Number(row.votes) || 0
      })),
      votedOptionId
    );
  }

  return {
    read: loadState,

    async vote(contentId, actorId, optionId, now) {
      const option = await db
        .prepare(
          `SELECT o.option_id
           FROM poll_options o
           JOIN contents c ON c.id = o.content_id
           WHERE o.content_id = ?1
             AND o.option_id = ?2
             AND c.status = 'published'
             AND c.format = 'poll'`
        )
        .bind(contentId, optionId)
        .first<{ option_id: string }>();

      if (!option) return null;

      const existing = await db
        .prepare(
          `SELECT option_id
           FROM poll_votes
           WHERE content_id = ?1 AND actor_id = ?2`
        )
        .bind(contentId, actorId)
        .first<{ option_id: string }>();

      if (existing) {
        // Da binh chon: khong doi dap an; tra trang thai hien tai.
        return loadState(contentId, actorId);
      }

      await db
        .prepare(
          `INSERT INTO poll_votes (content_id, actor_id, option_id, created_at)
           VALUES (?1, ?2, ?3, ?4)`
        )
        .bind(contentId, actorId, optionId, now)
        .run();

      return loadState(contentId, actorId);
    }
  };
}
