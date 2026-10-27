import {
  DEFAULT_AMBIENT_TRACK_ID,
  findAmbientTrack
} from "./tracks";

const STORAGE_KEY = "binhyen.ambient.v1";

export interface AmbientPrefs {
  enabled: boolean;
  volume: number;
  trackId: string;
}

export const DEFAULT_AMBIENT_PREFS: AmbientPrefs = {
  enabled: false,
  volume: 0.35,
  trackId: DEFAULT_AMBIENT_TRACK_ID
};

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AMBIENT_PREFS.volume;
  return Math.min(1, Math.max(0, value));
}

export function readAmbientPrefs(): AmbientPrefs {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_AMBIENT_PREFS };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AMBIENT_PREFS };

    const parsed = JSON.parse(raw) as Partial<AmbientPrefs>;
    const track = findAmbientTrack(
      typeof parsed.trackId === "string" ? parsed.trackId : null
    );

    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_AMBIENT_PREFS.enabled,
      volume: clampVolume(
        typeof parsed.volume === "number"
          ? parsed.volume
          : DEFAULT_AMBIENT_PREFS.volume
      ),
      trackId: track?.id ?? DEFAULT_AMBIENT_TRACK_ID
    };
  } catch {
    return { ...DEFAULT_AMBIENT_PREFS };
  }
}

export function writeAmbientPrefs(prefs: AmbientPrefs): void {
  if (typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        enabled: prefs.enabled,
        volume: clampVolume(prefs.volume),
        trackId: findAmbientTrack(prefs.trackId)?.id ?? DEFAULT_AMBIENT_TRACK_ID
      })
    );
  } catch {
    // Quota / private mode — bo qua.
  }
}
