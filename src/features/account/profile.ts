import { isContentTopic, type ContentTopic } from "../content/content.types";

export const MAX_PROFILE_TOPICS = 8;

export interface TopicChoice {
  slug: string;
  label: string;
  chosen: boolean;
}

export interface Profile {
  displayName: string;
  topics: TopicChoice[];
}

export interface ProfileUpdate {
  displayName: string;
  topics: ContentTopic[];
}

export interface ProfileStore {
  read(userId: string): Promise<Profile | null>;
  save(userId: string, update: ProfileUpdate, now: number): Promise<void>;
}

export function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 60 ? name : null;
}

export function parseProfileUpdate(input: unknown): ProfileUpdate | null {
  if (!input || typeof input !== "object") return null;

  const { displayName, topics } = input as Record<string, unknown>;
  const name = cleanDisplayName(displayName);

  if (!name || !Array.isArray(topics) || topics.length > MAX_PROFILE_TOPICS) {
    return null;
  }

  const chosen = new Set<ContentTopic>();

  for (const topic of topics) {
    if (typeof topic !== "string" || !isContentTopic(topic)) return null;
    chosen.add(topic);
  }

  return { displayName: name, topics: [...chosen] };
}
