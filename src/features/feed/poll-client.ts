import type { PollState } from "../interactions/content-polls";

function readPollState(value: unknown): PollState | null {
  if (!value || typeof value !== "object") return null;

  const payload = value as Record<string, unknown>;
  if (payload.success !== true) return null;
  if (typeof payload.total !== "number" || !Number.isFinite(payload.total)) {
    return null;
  }
  if (typeof payload.revealed !== "boolean") return null;
  if (
    !(
      payload.votedOptionId === null ||
      (typeof payload.votedOptionId === "string" &&
        /^o[1-4]$/.test(payload.votedOptionId))
    )
  ) {
    return null;
  }
  if (!Array.isArray(payload.options)) return null;

  const options: PollState["options"] = [];

  for (const entry of payload.options) {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^o[1-4]$/.test(row.id)) return null;
    if (typeof row.label !== "string") return null;
    if (
      !(
        row.votes === null ||
        (typeof row.votes === "number" && Number.isFinite(row.votes))
      )
    ) {
      return null;
    }
    if (
      !(
        row.percent === null ||
        (typeof row.percent === "number" && Number.isFinite(row.percent))
      )
    ) {
      return null;
    }
    options.push({
      id: row.id,
      label: row.label,
      votes: row.votes,
      percent: row.percent
    });
  }

  if (options.length < 2) return null;

  return {
    options,
    total: Math.max(0, Math.floor(payload.total)),
    votedOptionId: payload.votedOptionId,
    revealed: payload.revealed
  };
}

/** GET trang thai khao sat (an % neu chua binh chon). */
export async function fetchPollState(
  contentId: string,
  signal?: AbortSignal
): Promise<PollState | null> {
  try {
    const response = await fetch(
      `/api/contents/${encodeURIComponent(contentId)}/poll`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal
      }
    );
    if (!response.ok) return null;
    return readPollState(await response.json());
  } catch {
    return null;
  }
}

/** POST binh chon; tra ve ket qua (co %). */
export async function votePoll(
  contentId: string,
  optionId: string
): Promise<PollState | null> {
  try {
    const response = await fetch(
      `/api/contents/${encodeURIComponent(contentId)}/poll`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ optionId })
      }
    );
    if (!response.ok) return null;
    return readPollState(await response.json());
  } catch {
    return null;
  }
}
