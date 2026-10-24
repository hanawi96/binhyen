import type { ContentTheme } from "../content/content.types";
import type { ReactionKind } from "./content-reactions";

export interface MyReactionItem {
  id: string;
  title: string;
  category: string;
  description: string;
  theme: ContentTheme;
  reactedAt: number;
}

export interface MyReactionCounts {
  liked: number;
  saved: number;
}

export interface MyReactionCursor {
  reactedAt: number;
  id: string;
}

export interface MyReactionPage {
  items: MyReactionItem[];
  nextCursor: string | null;
}

export interface MyReactionStore {
  page(
    actorId: string,
    kind: ReactionKind,
    cursor: MyReactionCursor | null,
    limit: number
  ): Promise<MyReactionPage>;
  counts(actorId: string): Promise<MyReactionCounts>;
}

export const MY_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 40;
const CURSOR_PATTERN = /^(\d{1,12})\.([A-Za-z0-9_-]{1,80})$/;

export function parseMyKind(value: string | null): ReactionKind | null {
  return value === "like" || value === "save" ? value : null;
}

export function parseMyLimit(value: string | null): number {
  const limit = Number(value);

  return Number.isInteger(limit) && limit > 0
    ? Math.min(limit, MAX_PAGE_SIZE)
    : MY_PAGE_SIZE;
}

export function encodeMyCursor(cursor: MyReactionCursor): string {
  return `${cursor.reactedAt}.${cursor.id}`;
}

export function decodeMyCursor(value: string): MyReactionCursor | null {
  const match = CURSOR_PATTERN.exec(value);
  if (!match) return null;

  return { reactedAt: Number(match[1]), id: match[2] };
}
