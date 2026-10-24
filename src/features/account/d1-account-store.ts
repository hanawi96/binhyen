import type { AccountStore, PublicUser, UserRecord } from "./account";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
}

const UNCLAIMED = `EXISTS (
  SELECT 1 FROM actors WHERE id = ?1 AND user_id IS NULL
)`;

/** Luot cua ma an danh trung voi luot da co cua tai khoan. */
function duplicateOf(kind: "like" | "save"): string {
  return `(
    SELECT COUNT(*) FROM content_reactions a
    WHERE a.actor_id = ?1
      AND a.kind = '${kind}'
      AND a.content_id = content_stats.content_id
      AND EXISTS (
        SELECT 1 FROM content_reactions p
        WHERE p.actor_id = ?2
          AND p.kind = a.kind
          AND p.content_id = a.content_id
      )
  )`;
}

export function createD1AccountStore(db: D1Database): AccountStore {
  return {
    async findUserByEmail(email): Promise<UserRecord | null> {
      const row = await db
        .prepare(
          `SELECT id, email, display_name, password_hash
           FROM users
           WHERE email = ?1`
        )
        .bind(email)
        .first<UserRow>();

      return row
        ? {
            id: row.id,
            email: row.email,
            displayName: row.display_name,
            passwordHash: row.password_hash
          }
        : null;
    },

    async createUser(user, now) {
      const result = await db
        .prepare(
          `INSERT INTO users
             (id, email, display_name, password_hash, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5)
           ON CONFLICT (email) DO NOTHING`
        )
        .bind(user.id, user.email, user.displayName, user.passwordHash, now)
        .run();

      return result.meta.changes > 0;
    },

    async createSession(tokenHash, userId, now, expiresAt) {
      await db.batch([
        db
          .prepare(
            `DELETE FROM user_sessions
             WHERE user_id = ?1 AND expires_at <= ?2`
          )
          .bind(userId, now),
        db
          .prepare(
            `INSERT INTO user_sessions
               (token_hash, user_id, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4)`
          )
          .bind(tokenHash, userId, now, expiresAt)
      ]);
    },

    async findSessionUser(tokenHash, now): Promise<PublicUser | null> {
      const row = await db
        .prepare(
          `SELECT u.id, u.email, u.display_name
           FROM user_sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ?1 AND s.expires_at > ?2`
        )
        .bind(tokenHash, now)
        .first<Omit<UserRow, "password_hash">>();

      return row
        ? { id: row.id, email: row.email, displayName: row.display_name }
        : null;
    },

    async deleteSession(tokenHash) {
      await db
        .prepare(`DELETE FROM user_sessions WHERE token_hash = ?1`)
        .bind(tokenHash)
        .run();
    },

    async primaryActor(userId) {
      const row = await db
        .prepare(
          `SELECT id FROM actors
           WHERE user_id = ?1
           ORDER BY created_at, id
           LIMIT 1`
        )
        .bind(userId)
        .first<{ id: string }>();

      return row?.id ?? null;
    },

    async claimActor(actorId, userId, now) {
      const result = await db
        .prepare(
          `UPDATE actors
           SET user_id = ?2, last_seen_at = ?3
           WHERE id = ?1 AND user_id IS NULL`
        )
        .bind(actorId, userId, now)
        .run();

      return result.meta.changes > 0;
    },

    async createActor(actorId, userId, now) {
      await db
        .prepare(
          `INSERT INTO actors (id, user_id, created_at, last_seen_at)
           VALUES (?1, ?2, ?3, ?3)`
        )
        .bind(actorId, userId, now)
        .run();
    },

    async mergeActor(fromId, intoId, now) {
      await db.batch([
        db
          .prepare(
            `UPDATE content_stats
             SET like_count = like_count - ${duplicateOf("like")},
                 save_count = save_count - ${duplicateOf("save")},
                 updated_at = ?3
             WHERE ${UNCLAIMED}
               AND content_id IN (
                 SELECT content_id FROM content_reactions WHERE actor_id = ?1
               )`
          )
          .bind(fromId, intoId, now),
        db
          .prepare(
            `DELETE FROM content_reactions
             WHERE actor_id = ?1
               AND ${UNCLAIMED}
               AND EXISTS (
                 SELECT 1 FROM content_reactions p
                 WHERE p.actor_id = ?2
                   AND p.kind = content_reactions.kind
                   AND p.content_id = content_reactions.content_id
               )`
          )
          .bind(fromId, intoId),
        db
          .prepare(
            `UPDATE content_reactions SET actor_id = ?2
             WHERE actor_id = ?1 AND ${UNCLAIMED}`
          )
          .bind(fromId, intoId),
        db
          .prepare(
            `UPDATE content_shares SET actor_id = ?2
             WHERE actor_id = ?1 AND ${UNCLAIMED}`
          )
          .bind(fromId, intoId),
        db
          .prepare(`DELETE FROM actors WHERE id = ?1 AND user_id IS NULL`)
          .bind(fromId)
      ]);
    }
  };
}
