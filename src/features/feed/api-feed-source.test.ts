import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentItem } from "../content/content.types";
import {
  createApiFeedSource,
  FeedLoadError,
  isFeedAbort
} from "./api-feed-source";

function item(id: string): ContentItem {
  return {
    id,
    slug: id,
    kind: "quote",
    status: "published",
    category: "Bình yên",
    title: "Một câu ngắn",
    description: "Mô tả",
    tag: "Nhẹ",
    theme: "peace",
    topics: ["peace"],
    suitableMoods: ["calm"]
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function source(
  fetchPage: typeof fetch,
  timeoutMs = 10000
) {
  return createApiFeedSource("peace", "calm", {
    origin: "http://feed.test",
    fetch: fetchPage,
    timeoutMs
  });
}

function hang(
  _input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;

    if (!signal) return;

    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    signal.addEventListener("abort", () => {
      reject(signal.reason);
    });
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("API feed requests", () => {
  it("asks for the next cursor and does not repeat it", async () => {
    const urls: string[] = [];
    const feed = source(async (input) => {
      const url = String(input);
      urls.push(url);

      if (!url.includes("cursor=")) {
        return jsonResponse({
          success: true,
          items: [item("1")],
          nextCursor: "page-2",
          hasMore: true
        });
      }

      return jsonResponse({
        success: true,
        items: [item("2")],
        nextCursor: null,
        hasMore: false
      });
    });

    const first = await feed.loadPage("__first__", 3);
    const second = await feed.loadPage(first.nextCursor ?? "", 3);

    expect(first.items.map((entry) => entry.id)).toEqual(["1"]);
    expect(second.items.map((entry) => entry.id)).toEqual(["2"]);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("cursor=page-2");
    expect(urls[0]).toContain("topic=peace");
    expect(urls[0]).toContain("mood=calm");
  });

  it("returns the server page in its original order", async () => {
    let calls = 0;
    const feed = source(async () => {
      calls += 1;
      return jsonResponse({
        success: true,
        items: [item("4"), item("6"), item("2")],
        nextCursor: "next",
        hasMore: true,
        matched: false
      });
    });

    const page = await feed.loadPage("__first__", 3);

    expect(page.items.map((entry) => entry.id)).toEqual([
      "4",
      "6",
      "2"
    ]);
    expect(page.nextCursor).toBe("next");
    expect(page.matched).toBe(false);
    expect(calls).toBe(1);
  });

  it("stops when the same cursor is requested again", async () => {
    let calls = 0;
    const feed = source(async () => {
      calls += 1;
      return jsonResponse({
        success: true,
        items: [],
        nextCursor: "same",
        hasMore: true
      });
    });

    const first = await feed.loadPage("__first__", 3);
    await feed.loadPage(first.nextCursor ?? "", 3);

    await expect(
      feed.loadPage(first.nextCursor ?? "", 3)
    ).rejects.toMatchObject({
      reason: "invalid",
      message: "Repeated feed cursor"
    });
    expect(calls).toBe(2);
  });

  it("does not keep requesting after HTTP 500, and a retry can succeed", async () => {
    let calls = 0;
    const feed = source(async () => {
      calls += 1;

      if (calls === 1) {
        return new Response("nope", { status: 500 });
      }

      return jsonResponse({
        success: true,
        items: [item("9")],
        nextCursor: null,
        hasMore: false
      });
    });

    await expect(feed.loadPage("__first__", 3)).rejects.toBeInstanceOf(
      FeedLoadError
    );
    expect(calls).toBe(1);

    const page = await feed.loadPage("__first__", 3);

    expect(page.items.map((entry) => entry.id)).toEqual(["9"]);
    expect(calls).toBe(2);
  });

  it("reports a network failure once", async () => {
    let calls = 0;
    const feed = source(async () => {
      calls += 1;
      throw new TypeError("Failed to fetch");
    });

    await expect(feed.loadPage("__first__", 3)).rejects.toMatchObject({
      reason: "network"
    });
    expect(calls).toBe(1);
  });

  it("reports an abort separately from a failed load", async () => {
    const controller = new AbortController();
    const feed = source(hang);
    const pending = feed.loadPage(
      "__first__",
      3,
      controller.signal
    );

    controller.abort();

    await expect(pending).rejects.toSatisfy(isFeedAbort);
  });

  it("reports a timeout", async () => {
    vi.useFakeTimers();
    const feed = source(hang, 1000);
    const pending = feed.loadPage("__first__", 3);
    const assertion = expect(pending).rejects.toMatchObject({
      reason: "timeout"
    });

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
