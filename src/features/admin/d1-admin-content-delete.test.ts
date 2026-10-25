import { describe, expect, it } from "vitest";

import { openTestDatabase } from "../../test/sqlite-d1";
import {
  createAdminContent,
  deleteAdminContent,
  getAdminContent
} from "./d1-admin-content";
import type { ContentDraftInput } from "./content-draft";

const draft: ContentDraftInput = {
  title: "Bài sẽ bị xóa",
  description: "",
  category: "Bình yên",
  tag: "",
  format: "text",
  kind: "story",
  theme: "peace",
  topics: ["peace"],
  moods: ["calm"],
  sourceLabel: "",
  sourceUrl: "",
  body: "",
  imageUrl: "",
  imageAlt: "",
  imageWidth: null,
  imageHeight: null,
  posterUrl: "",
  pollOptions: [],
  collectionIds: []
};

describe("deleteAdminContent", () => {
  it("xóa bài và cascade topic; không tìm thấy thì false", async () => {
    const { db, sqlite } = openTestDatabase();
    const created = await createAdminContent(db, draft, 1_700_000_000);

    expect(await getAdminContent(db, created.id)).not.toBeNull();
    expect(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS n FROM content_topics WHERE content_id = ?`
        )
        .get(created.id) as { n: number }
    ).toMatchObject({ n: 1 });

    expect(await deleteAdminContent(db, created.id)).toBe(true);
    expect(await getAdminContent(db, created.id)).toBeNull();
    expect(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS n FROM content_topics WHERE content_id = ?`
        )
        .get(created.id) as { n: number }
    ).toMatchObject({ n: 0 });
    expect(await deleteAdminContent(db, created.id)).toBe(false);
  });
});
