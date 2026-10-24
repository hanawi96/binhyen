export type ReactionKind = "like" | "save";
export type ShareChannel = "native" | "copy_link" | "other";

export interface ReactionState {
  liked: boolean;
  saved: boolean;
  likeCount: number;
  saveCount: number;
  shareCount: number;
}

/** Moi ham tra null khi bai khong ton tai hoac chua xuat ban. */
export interface ReactionStore {
  read(contentId: string, actorId: string | null): Promise<ReactionState | null>;
  react(
    contentId: string,
    actorId: string,
    kind: ReactionKind,
    on: boolean,
    now: number
  ): Promise<ReactionState | null>;
  share(
    contentId: string,
    actorId: string,
    channel: ShareChannel,
    now: number
  ): Promise<ReactionState | null>;
}

export interface ReactionRequest {
  kind: ReactionKind;
  on: boolean;
}

function field(body: unknown, key: string): unknown {
  return body && typeof body === "object" && key in body
    ? (body as Record<string, unknown>)[key]
    : undefined;
}

export function parseReactionRequest(body: unknown): ReactionRequest | null {
  const kind = field(body, "kind");
  const on = field(body, "on");

  if ((kind !== "like" && kind !== "save") || typeof on !== "boolean") {
    return null;
  }

  return { kind, on };
}

export function parseShareChannel(body: unknown): ShareChannel | null {
  const channel = field(body, "channel");

  return channel === "native" || channel === "copy_link" || channel === "other"
    ? channel
    : null;
}
