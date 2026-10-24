import { isActorId } from "../actor/actor";

/**
 * Khoa cua mot nguoi xem trong viewer_feed_state.
 * 'u:<user_id>' khi dang nhap de moi thiet bi dung chung lich su;
 * 'a:<actor_id>' khi an danh, theo cookie cua trinh duyet.
 */
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const VIEWER_KEY_PATTERN = /^(?:u:[A-Za-z0-9_-]{16,80}|a:[A-Za-z0-9_-]{22})$/;

export function userViewerKey(userId: string): string | null {
  return USER_ID_PATTERN.test(userId) ? `u:${userId}` : null;
}

export function actorViewerKey(actorId: string): string | null {
  return isActorId(actorId) ? `a:${actorId}` : null;
}

export function isViewerKey(value: string): boolean {
  return VIEWER_KEY_PATTERN.test(value);
}

/** Tai khoan dang nhap duoc uu tien; khong co ai thi null. */
export function resolveViewerKey(input: {
  userId: string | null;
  actorId: string | null;
}): string | null {
  if (input.userId !== null) {
    const key = userViewerKey(input.userId);
    if (key) return key;
  }

  return input.actorId !== null ? actorViewerKey(input.actorId) : null;
}
