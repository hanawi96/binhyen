import { describe, expect, it } from "vitest";

import type { ActorStore } from "../actor/actor";
import { resolveActor } from "../actor/actor";
import {
  InteractionLimitedError,
  allowed,
  clientIp,
  guardActorCreation
} from "./rate-limit";

function memoryStore(): ActorStore & { ids: Set<string> } {
  const ids = new Set<string>();

  return {
    ids,
    async find(id) {
      return ids.has(id) ? { lastSeenAt: 1000 } : null;
    },
    async create(id) {
      ids.add(id);
    },
    async touch() {}
  };
}

describe("rate limit helpers", () => {
  it("reads the Cloudflare client ip", () => {
    const request = new Request("https://x.test", {
      headers: { "cf-connecting-ip": "203.0.113.9" }
    });

    expect(clientIp(request)).toBe("203.0.113.9");
    expect(clientIp(new Request("https://x.test"))).toBe("local");
  });

  it("allows when the binding is missing", async () => {
    expect(await allowed(undefined, "k")).toBe(true);
    expect(
      await allowed({ limit: async () => ({ success: false }) }, "k")
    ).toBe(false);
  });

  it("blocks new actors but keeps existing ones working", async () => {
    const store = memoryStore();
    store.ids.add("A".repeat(22));
    const guarded = guardActorCreation(store, async () => false);

    const known = await resolveActor(
      guarded,
      `binhyen_actor=${"A".repeat(22)}`,
      1000
    );
    expect(known.id).toBe("A".repeat(22));

    await expect(
      resolveActor(guarded, `binhyen_actor=${"B".repeat(22)}`, 1000)
    ).rejects.toBeInstanceOf(InteractionLimitedError);
    await expect(resolveActor(guarded, null, 1000)).rejects.toBeInstanceOf(
      InteractionLimitedError
    );
    expect(store.ids.size).toBe(1);
  });
});
