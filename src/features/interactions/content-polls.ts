export interface PollOptionState {
  id: string;
  label: string;
  /** Chi tra khi da binh chon (hoac admin). */
  votes: number | null;
  percent: number | null;
}

export interface PollState {
  options: PollOptionState[];
  total: number;
  votedOptionId: string | null;
  /** true neu da hien ket qua (da chon). */
  revealed: boolean;
}

export interface PollStore {
  read(
    contentId: string,
    actorId: string | null
  ): Promise<PollState | null>;
  vote(
    contentId: string,
    actorId: string,
    optionId: string,
    now: number
  ): Promise<PollState | null>;
}

const OPTION_ID = /^o[1-4]$/;
const MAX_LABEL = 120;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

export function parsePollVote(input: unknown): { optionId: string } | null {
  if (!input || typeof input !== "object") return null;
  const optionId = (input as Record<string, unknown>).optionId;
  if (typeof optionId !== "string" || !OPTION_ID.test(optionId)) return null;
  return { optionId };
}

/** Nhan dap an tu form admin; gan id o1..o4 theo thu tu. */
export function parsePollOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < MIN_OPTIONS || value.length > MAX_OPTIONS) return null;

  const labels: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") return null;
    const label = item.trim().replace(/\s+/g, " ");
    if (!label || label.length > MAX_LABEL) return null;
    if (labels.includes(label)) return null;
    labels.push(label);
  }

  return labels;
}

export function pollOptionId(index: number): string {
  return `o${index + 1}`;
}

export function buildPollState(
  rows: Array<{ option_id: string; label: string; votes: number }>,
  votedOptionId: string | null
): PollState {
  const total = rows.reduce((sum, row) => sum + row.votes, 0);
  const revealed = votedOptionId !== null;

  return {
    total,
    votedOptionId,
    revealed,
    options: rows.map((row) => ({
      id: row.option_id,
      label: row.label,
      votes: revealed ? row.votes : null,
      percent:
        revealed && total > 0
          ? Math.round((row.votes / total) * 100)
          : revealed
            ? 0
            : null
    }))
  };
}
