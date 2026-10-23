
import { describe, expect, it } from "vitest";

import { demoContents } from "../content/demo-contents";
import { createDemoFeedSource } from "./feed-source";

describe("Feed pagination and buffer source", () => {
  it("returns the first page with a next cursor", () => {
    const source = createDemoFeedSource(
      "all",
      "all",
      new Set<string>()
    );

    const page = source.firstPage(3);

    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBe("3");
  });

  it("loads all pages without skipping or duplicating IDs", async () => {
    const source = createDemoFeedSource(
      "all",
      "all",
      new Set<string>()
    );

    const first = source.firstPage(2);

    expect(first.nextCursor).not.toBeNull();

    const second = await source.loadPage(
      first.nextCursor!,
      2
    );

    expect(second.nextCursor).not.toBeNull();

    const third = await source.loadPage(
      second.nextCursor!,
      2
    );

    const items = [
      ...first.items,
      ...second.items,
      ...third.items
    ];

    const ids = items.map((item) => item.id);

    expect(items).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(third.nextCursor).toBeNull();

    expect(ids.slice().sort()).toEqual(
      demoContents.map((item) => item.id).sort()
    );
  });

  it("excludes previously seen IDs", () => {
    const excluded = new Set(["1", "3"]);

    const source = createDemoFeedSource(
      "all",
      "all",
      excluded
    );

    const page = source.firstPage(10);
    const ids = page.items.map((item) => item.id);

    expect(ids).not.toContain("1");
    expect(ids).not.toContain("3");
    expect(page.items).toHaveLength(4);
    expect(page.nextCursor).toBeNull();
  });

  it("handles a completely exhausted content pool", () => {
    const excluded = new Set(
      demoContents.map((item) => item.id)
    );

    const source = createDemoFeedSource(
      "all",
      "all",
      excluded
    );

    const page = source.firstPage(3);

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("rejects invalid pagination cursors", async () => {
    const source = createDemoFeedSource(
      "all",
      "all",
      new Set<string>()
    );

    await expect(
      source.loadPage("invalid", 3)
    ).rejects.toThrow("Invalid feed cursor");

    await expect(
      source.loadPage("-1", 3)
    ).rejects.toThrow("Invalid feed cursor");

    await expect(
      source.loadPage("999", 3)
    ).rejects.toThrow("Invalid feed cursor");
  });

  it("does not return an invalid page size", () => {
    const source = createDemoFeedSource(
      "all",
      "all",
      new Set<string>()
    );

    const page = source.firstPage(0);

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
  });
});
