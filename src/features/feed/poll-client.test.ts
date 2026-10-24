import { describe, expect, it, vi } from "vitest";

import { fetchPollState, votePoll } from "./poll-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("poll-client", () => {
  it("đọc GET poll khi success", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        success: true,
        total: 0,
        votedOptionId: null,
        revealed: false,
        options: [
          { id: "o1", label: "Êm", votes: null, percent: null },
          { id: "o2", label: "Mệt", votes: null, percent: null }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const state = await fetchPollState("polldemo01");
    expect(state?.revealed).toBe(false);
    expect(state?.options).toHaveLength(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/contents/polldemo01/poll"
    );

    vi.unstubAllGlobals();
  });

  it("POST vote và nhận %", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          success: true,
          total: 1,
          votedOptionId: "o2",
          revealed: true,
          options: [
            { id: "o1", label: "Êm", votes: 0, percent: 0 },
            { id: "o2", label: "Mệt", votes: 1, percent: 100 }
          ]
        })
      )
    );

    const state = await votePoll("polldemo01", "o2");
    expect(state?.revealed).toBe(true);
    expect(state?.votedOptionId).toBe("o2");
    expect(state?.options[1]?.percent).toBe(100);

    vi.unstubAllGlobals();
  });

  it("trả null khi HTTP lỗi", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 404)));
    expect(await fetchPollState("missing")).toBeNull();
    vi.unstubAllGlobals();
  });
});
