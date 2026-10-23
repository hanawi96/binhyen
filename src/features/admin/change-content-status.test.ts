import { describe, expect, it } from "vitest";

import { changeContentStatus } from "./change-content-status";
import type {
  ContentStatusRecord,
  ContentStatusStore
} from "./change-content-status";
import type { ContentStatus } from "../content/content.types";

function memoryStore(
  rows: Record<string, ContentStatusRecord>
): ContentStatusStore & {
  saved: Array<{
    id: string;
    from: ContentStatus;
    status: ContentStatus;
  }>;
} {
  const saved: Array<{
    id: string;
    from: ContentStatus;
    status: ContentStatus;
  }> = [];

  return {
    saved,
    async find(id) {
      return rows[id] ?? null;
    },
    async save(id, from, status, publishedAt) {
      const row = rows[id];

      if (!row || row.status !== from) return false;

      rows[id] = { status, publishedAt };
      saved.push({ id, from, status });
      return true;
    }
  };
}

describe("Change content status", () => {
  it("publishes a draft once", async () => {
    const store = memoryStore({
      post: { status: "draft", publishedAt: null }
    });

    const result = await changeContentStatus(
      store,
      "post",
      "published",
      100
    );

    expect(result).toEqual({
      ok: true,
      id: "post",
      status: "published",
      publishedAt: 100
    });
    expect(store.saved).toEqual([
      { id: "post", from: "draft", status: "published" }
    ]);
  });

  it("archives a published post and keeps the publish time", async () => {
    const store = memoryStore({
      post: { status: "published", publishedAt: 100 }
    });

    const result = await changeContentStatus(
      store,
      "post",
      "archived",
      250
    );

    expect(result).toEqual({
      ok: true,
      id: "post",
      status: "archived",
      publishedAt: 100
    });
  });

  it("returns a published post to draft and keeps the publish time", async () => {
    const store = memoryStore({
      post: { status: "published", publishedAt: 100 }
    });

    const result = await changeContentStatus(
      store,
      "post",
      "draft",
      250
    );

    expect(result).toEqual({
      ok: true,
      id: "post",
      status: "draft",
      publishedAt: 100
    });
  });

  it("does not revive an archived post", async () => {
    const store = memoryStore({
      post: { status: "archived", publishedAt: 100 }
    });

    const result = await changeContentStatus(
      store,
      "post",
      "published",
      250
    );

    expect(result).toEqual({ ok: false, reason: "rejected" });
    expect(store.saved).toEqual([]);
  });

  it("reports a missing post", async () => {
    const store = memoryStore({});

    const result = await changeContentStatus(
      store,
      "missing",
      "published",
      100
    );

    expect(result).toEqual({ ok: false, reason: "missing" });
  });
});
