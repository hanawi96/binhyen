export interface AmbientTrack {
  id: string;
  title: string;
  /** /api/media/audio/... (R2). */
  src: string;
}

/**
 * Fallback khi API chua tra ve / loi mang.
 * Khong dung public/ambient — nguon that la R2 + D1 (admin).
 */
export const FALLBACK_AMBIENT_TRACKS: readonly AmbientTrack[] = [];

export const DEFAULT_AMBIENT_TRACK_ID = "piano";

/** @deprecated dung getAmbientCatalog() */
export const AMBIENT_TRACKS = FALLBACK_AMBIENT_TRACKS;

let catalog: AmbientTrack[] = [];
let defaultTrackId = DEFAULT_AMBIENT_TRACK_ID;

export function getAmbientCatalog(): readonly AmbientTrack[] {
  return catalog;
}

export function getAmbientDefaultId(): string {
  return defaultTrackId;
}

export function setAmbientCatalog(
  tracks: readonly AmbientTrack[],
  defaultId: string | null
): void {
  if (tracks.length === 0) {
    catalog = [];
    defaultTrackId = DEFAULT_AMBIENT_TRACK_ID;
    return;
  }

  catalog = tracks.map((track) => ({
    id: track.id,
    title: track.title,
    src: track.src
  }));
  defaultTrackId =
    (defaultId && catalog.some((track) => track.id === defaultId)
      ? defaultId
      : catalog[0]?.id) ?? DEFAULT_AMBIENT_TRACK_ID;
}

export function findAmbientTrack(
  id: string | null | undefined
): AmbientTrack | null {
  if (catalog.length === 0) return null;

  const fallback =
    catalog.find((track) => track.id === defaultTrackId) ??
    catalog[0] ??
    null;

  if (!id) return fallback;
  return catalog.find((track) => track.id === id) ?? fallback;
}

export function nextAmbientTrackId(currentId: string): string {
  if (catalog.length === 0) return defaultTrackId;
  const at = catalog.findIndex((track) => track.id === currentId);
  const next = catalog[(at + 1) % catalog.length];
  return next?.id ?? defaultTrackId;
}
