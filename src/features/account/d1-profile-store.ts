import { isContentTopic, type ContentTopic } from "../content/content.types";
import { hashSessionToken, readSessionToken } from "./account";
import type { ProfileStore } from "./profile";

/** Chu de yeu thich cua nguoi dang dang nhap; khong co cookie thi khong goi DB. */
export async function readSessionTopics(
  db: D1Database,
  cookieHeader: string | null,
  now: number
): Promise<ContentTopic[]> {
  const token = readSessionToken(cookieHeader);
  if (!token) return [];

  const { results } = await db
    .prepare(
      `SELECT ut.topic_slug AS slug
       FROM user_sessions s
       JOIN user_topics ut ON ut.user_id = s.user_id
       WHERE s.token_hash = ?1 AND s.expires_at > ?2`
    )
    .bind(await hashSessionToken(token), now)
    .all<{ slug: string }>();

  return results.map((row) => row.slug).filter(isContentTopic);
}

interface TopicRow {
  slug: string;
  label: string;
  chosen: number;
}

export function createD1ProfileStore(db: D1Database): ProfileStore {
  return {
    async read(userId) {
      const [user, topics] = await db.batch([
        db
          .prepare(`SELECT display_name FROM users WHERE id = ?1`)
          .bind(userId),
        db
          .prepare(
            `SELECT t.slug, t.label,
                    EXISTS (
                      SELECT 1 FROM user_topics u
                      WHERE u.user_id = ?1 AND u.topic_slug = t.slug
                    ) AS chosen
             FROM topics t
             ORDER BY t.sort_order, t.slug`
          )
          .bind(userId)
      ]);

      const name = (user?.results[0] as { display_name?: unknown } | undefined)
        ?.display_name;
      if (typeof name !== "string") return null;

      return {
        displayName: name,
        topics: (topics?.results as TopicRow[] | undefined ?? []).map(
          (row) => ({
            slug: row.slug,
            label: row.label,
            chosen: row.chosen === 1
          })
        )
      };
    },

    async save(userId, update, now) {
      await db.batch([
        db
          .prepare(
            `UPDATE users SET display_name = ?2, updated_at = ?3
             WHERE id = ?1`
          )
          .bind(userId, update.displayName, now),
        db.prepare(`DELETE FROM user_topics WHERE user_id = ?1`).bind(userId),
        ...update.topics.map((topic) =>
          db
            .prepare(
              `INSERT INTO user_topics (user_id, topic_slug, created_at)
               SELECT ?1, slug, ?3 FROM topics WHERE slug = ?2`
            )
            .bind(userId, topic, now)
        )
      ]);
    }
  };
}
