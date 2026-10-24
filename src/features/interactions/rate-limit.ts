import type { ActorStore } from "../actor/actor";

export class InteractionLimitedError extends Error {
  constructor() {
    super("Too many interactions");
    this.name = "InteractionLimitedError";
  }
}

export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** IP chi dung lam khoa dem tam o Cloudflare, khong luu vao D1. */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}

/** Thieu binding thi cho qua, khong chan nguoi dung vi loi cau hinh. */
export async function allowed(
  limiter: Limiter | undefined,
  key: string
): Promise<boolean> {
  if (!limiter) return true;

  const outcome = await limiter.limit({ key });
  return outcome.success;
}

/**
 * Chan tao ma an danh moi theo IP ngay tai luc tao,
 * nen cookie gia (dung dinh dang, khong co trong DB) cung bi tinh.
 */
export function guardActorCreation(
  store: ActorStore,
  allowNew: () => Promise<boolean>
): ActorStore {
  return {
    find: (id) => store.find(id),
    touch: (id, now) => store.touch(id, now),
    async create(id, now) {
      if (!(await allowNew())) throw new InteractionLimitedError();
      await store.create(id, now);
    }
  };
}
