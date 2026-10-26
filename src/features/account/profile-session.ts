import {
  loadProfile,
  saveProfile,
  type AccountUser,
  type Profile
} from "./account-client";
import { MAX_PROFILE_TOPICS } from "./profile";

export { MAX_PROFILE_TOPICS };

const DEBOUNCE_MS = 480;

export type ProfileListener = (profile: Profile) => void;
export type SaveErrorListener = (message: string | null) => void;

export type TopicsSaveResult =
  | { ok: true; user: AccountUser; profile: Profile; topicsChanged: boolean }
  | { ok: false; message: string };

type Cache = {
  userId: string;
  profile: Profile;
  /** Key chủ đề đã lưu thành công trên server (hoặc vừa put từ nguồn khác). */
  savedKey: string;
};

let cache: Cache | null = null;
let loadFor: string | null = null;
let loadPromise: Promise<Profile | null> | null = null;
let listeners = new Set<ProfileListener>();
let errorListeners = new Set<SaveErrorListener>();

let pendingChosen: string[] | null = null;
let debounceTimer = 0;
/** Promise lưu đang chạy — flush/debounce cùng chờ một chuỗi. */
let savePromise: Promise<TopicsSaveResult | null> | null = null;

/** Chuỗi ổn định để so sánh tập chủ đề (không phụ thuộc thứ tự). */
export function topicKey(slugs: string[]): string {
  return [...slugs].sort().join(".");
}

export function chosenSlugs(profile: Profile): string[] {
  return profile.topics.filter((topic) => topic.chosen).map((topic) => topic.slug);
}

export function withChosen(profile: Profile, chosen: string[]): Profile {
  const set = new Set(chosen);
  return {
    displayName: profile.displayName,
    topics: profile.topics.map((topic) => ({
      ...topic,
      chosen: set.has(topic.slug)
    }))
  };
}

/** Khôi phục cờ chosen theo savedKey. */
export function restoreByKey(profile: Profile, savedKey: string): Profile {
  const set =
    savedKey === "" ? new Set<string>() : new Set(savedKey.split("."));
  return withChosen(profile, [...set]);
}

/** Bật/tắt một slug; tôn trọng giới hạn max (không thêm khi đã đủ). */
export function toggleChosen(
  chosen: string[],
  slug: string,
  max = MAX_PROFILE_TOPICS
): { chosen: string[]; blocked: boolean } {
  if (chosen.includes(slug)) {
    return {
      chosen: chosen.filter((item) => item !== slug),
      blocked: false
    };
  }
  if (chosen.length >= max) {
    return { chosen, blocked: true };
  }
  return { chosen: [...chosen, slug], blocked: false };
}

function emit(profile: Profile) {
  for (const listener of listeners) listener(profile);
}

function emitSaveError(message: string | null) {
  for (const listener of errorListeners) listener(message);
}

export function subscribeProfile(listener: ProfileListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeSaveError(listener: SaveErrorListener): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

export function peekProfile(userId: string): Profile | null {
  return cache?.userId === userId ? cache.profile : null;
}

/** Ghi cache từ nguồn đáng tin (GET/PUT thành công, hoặc lưu từ Cài đặt). */
export function putProfile(userId: string, profile: Profile): void {
  clearDebounce();
  pendingChosen = null;
  cache = {
    userId,
    profile,
    savedKey: topicKey(chosenSlugs(profile))
  };
  emit(profile);
}

export function clearProfileSession(): void {
  clearDebounce();
  pendingChosen = null;
  cache = null;
  loadFor = null;
  loadPromise = null;
}

function clearDebounce() {
  if (debounceTimer) {
    window.clearTimeout(debounceTimer);
    debounceTimer = 0;
  }
}

function isDirty(userId: string): boolean {
  return (
    cache?.userId === userId &&
    pendingChosen !== null &&
    topicKey(pendingChosen) !== cache.savedKey
  );
}

/** Tải profile một lần / user; các lời gọi song song dùng chung promise. */
export async function ensureProfile(userId: string): Promise<Profile | null> {
  if (cache?.userId === userId) return cache.profile;

  if (loadFor === userId && loadPromise) return loadPromise;

  loadFor = userId;
  loadPromise = loadProfile()
    .then((profile) => {
      if (loadFor !== userId) return profile;
      if (profile) {
        cache = {
          userId,
          profile,
          savedKey: topicKey(chosenSlugs(profile))
        };
      }
      return profile;
    })
    .finally(() => {
      if (loadFor === userId) {
        loadFor = null;
        loadPromise = null;
      }
    });

  return loadPromise;
}

/**
 * Cập nhật chủ đề trên UI ngay, debounce PUT nền.
 * Trả về profile optimistic (hoặc null nếu chưa có cache).
 */
export function scheduleTopics(
  userId: string,
  chosen: string[]
): Profile | null {
  if (!cache || cache.userId !== userId) return null;

  const next = withChosen(cache.profile, chosen);
  cache = { ...cache, profile: next };
  pendingChosen = chosen;
  emitSaveError(null);
  emit(next);

  clearDebounce();
  debounceTimer = window.setTimeout(() => {
    debounceTimer = 0;
    void kickSave(userId);
  }, DEBOUNCE_MS);

  return next;
}

/** Đẩy lưu ngay (đóng sheet / rời trang). */
export function flushTopicsSave(
  userId: string
): Promise<TopicsSaveResult | null> {
  clearDebounce();
  if (!isDirty(userId) && !savePromise) return Promise.resolve(null);
  return kickSave(userId);
}

function kickSave(userId: string): Promise<TopicsSaveResult | null> {
  if (!savePromise) {
    savePromise = persistAll(userId).finally(() => {
      savePromise = null;
    });
  }
  return savePromise.then((result) => {
    if (isDirty(userId)) return kickSave(userId);
    return result;
  });
}

async function persistAll(userId: string): Promise<TopicsSaveResult | null> {
  let last: TopicsSaveResult | null = null;

  while (isDirty(userId) && cache) {
    const chosen = pendingChosen!;
    const key = topicKey(chosen);
    const baselineKey = cache.savedKey;
    const displayName = cache.profile.displayName;

    // Cho phép toggle mới trong lúc await — vòng while sẽ gửi tiếp.
    pendingChosen = null;

    const result = await saveProfile(displayName, chosen);

    if (!cache || cache.userId !== userId) {
      return result.ok
        ? {
            ok: true,
            user: result.user,
            profile: result.profile,
            topicsChanged: true
          }
        : result;
    }

    if (!result.ok) {
      cache = {
        ...cache,
        profile: restoreByKey(cache.profile, baselineKey)
      };
      pendingChosen = null;
      emit(cache.profile);
      emitSaveError(result.message);
      return result;
    }

    cache = {
      userId,
      profile: result.profile,
      savedKey: topicKey(chosenSlugs(result.profile))
    };
    emit(result.profile);
    emitSaveError(null);
    last = {
      ok: true,
      user: result.user,
      profile: result.profile,
      topicsChanged: key !== baselineKey
    };
  }

  return last;
}
