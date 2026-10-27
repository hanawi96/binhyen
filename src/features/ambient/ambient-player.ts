import {
  clampVolume,
  DEFAULT_AMBIENT_PREFS,
  readAmbientPrefs,
  writeAmbientPrefs,
  type AmbientPrefs
} from "./ambient-prefs";
import {
  findAmbientTrack,
  getAmbientCatalog,
  getAmbientDefaultId,
  setAmbientCatalog,
  type AmbientTrack
} from "./tracks";

export interface AmbientSnapshot {
  enabled: boolean;
  playing: boolean;
  volume: number;
  trackId: string;
  trackTitle: string;
  tracks: readonly AmbientTrack[];
  error: string;
}

type Listener = () => void;

let audio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let prefs: AmbientPrefs = { ...DEFAULT_AMBIENT_PREFS };
let playing = false;
let error = "";
let hydrated = false;
let unlockArmed = false;
let catalogReady = false;
let catalogPromise: Promise<void> | null = null;
/** Tang moi lan tryPlay / stop — huy luong play cu. */
let playEpoch = 0;
let pageExitBound = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * iOS / WebKit: `HTMLMediaElement.volume` bị bỏ qua (luôn ~1).
 * Phải chỉnh qua Web Audio GainNode. Desktop vẫn dùng được cả hai;
 * khi đã nối graph thì giữ element.volume = 1, chỉ điều khiển gain.
 */
function applyOutputVolume(volume = prefs.volume): void {
  const level = clampVolume(volume);
  if (gainNode) {
    gainNode.gain.value = level;
    if (audio) audio.volume = 1;
    return;
  }
  if (audio) audio.volume = level;
}

function ensureAudioGraph(node: HTMLAudioElement): void {
  if (mediaSource || typeof window === "undefined") return;

  const Ctx =
    window.AudioContext ||
    (
      window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!Ctx) {
    applyOutputVolume();
    return;
  }

  try {
    audioCtx = new Ctx();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = clampVolume(prefs.volume);
    mediaSource = audioCtx.createMediaElementSource(node);
    mediaSource.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    node.volume = 1;
  } catch {
    // Fallback: element.volume (desktop / trình duyệt cũ).
    gainNode = null;
    mediaSource = null;
    audioCtx = null;
    applyOutputVolume();
  }
}

async function resumeAudioContext(): Promise<void> {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      // ignore
    }
  }
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;

  audio = new Audio();
  audio.loop = true;
  audio.preload = "none";
  ensureAudioGraph(audio);
  applyOutputVolume();

  audio.addEventListener("playing", () => {
    if (!prefs.enabled) {
      // Play xen ke sau khi user da tat — dung ngay.
      stopHard();
      return;
    }
    playing = true;
    error = "";
    notify();
  });
  audio.addEventListener("pause", () => {
    playing = false;
    notify();
  });
  audio.addEventListener("error", () => {
    if (!prefs.enabled || !audio?.getAttribute("src")) return;
    playing = false;
    error = "Không phát được bài này.";
    notify();
  });

  return audio;
}

function persist(): void {
  writeAmbientPrefs(prefs);
}

function applyTrack(track: AmbientTrack): void {
  const node = ensureAudio();
  const next = track.src;
  const current = node.getAttribute("src");
  if (current === next) return;

  node.pause();
  node.src = next;
  node.load();
}

let unlockPointer: (() => void) | null = null;
let unlockKey: (() => void) | null = null;

function disarmUnlock(): void {
  unlockArmed = false;
  if (typeof document !== "undefined") {
    if (unlockPointer) {
      document.removeEventListener("pointerdown", unlockPointer, true);
      unlockPointer = null;
    }
    if (unlockKey) {
      document.removeEventListener("keydown", unlockKey, true);
      unlockKey = null;
    }
  }
}

function armUnlock(): void {
  if (unlockArmed || typeof document === "undefined") return;
  if (!prefs.enabled) return;
  unlockArmed = true;

  const unlock = () => {
    if (!unlockArmed) return;
    disarmUnlock();
    // Khong goi tryPlay trong cung gesture tat nhac — chi khi van dang bat.
    if (prefs.enabled && !playing) {
      queueMicrotask(() => {
        if (prefs.enabled && !playing) void tryPlay();
      });
    } else {
      void resumeAudioContext();
    }
  };

  unlockPointer = unlock;
  unlockKey = unlock;
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}

function bindPageExit(): void {
  if (pageExitBound || typeof window === "undefined") return;
  pageExitBound = true;

  // Dong tab/trinh duyet — dung audio ngay (khong doi prefs da luu).
  window.addEventListener("pagehide", () => {
    stopHard();
  });
}

async function tryPlay(): Promise<void> {
  if (!prefs.enabled) {
    stopHard();
    return;
  }

  const epoch = ++playEpoch;
  const track = findAmbientTrack(prefs.trackId);
  if (!track) {
    if (catalogReady) {
      error = "Chưa có bài nhạc. Vào /admin/ambient để upload.";
    }
    playing = false;
    notify();
    return;
  }

  const node = ensureAudio();
  applyTrack(track);
  applyOutputVolume();
  error = "";

  if (!prefs.enabled || epoch !== playEpoch) {
    stopHard();
    return;
  }

  try {
    await resumeAudioContext();
    await node.play();
    // Quan trong: play() thanh cong nhung user da tat / epoch doi → pause ngay.
    if (!prefs.enabled || epoch !== playEpoch) {
      node.pause();
      node.removeAttribute("src");
      node.load();
      playing = false;
      return;
    }
    playing = true;
    disarmUnlock();
  } catch {
    if (!prefs.enabled || epoch !== playEpoch) return;
    playing = false;
    armUnlock();
  }

  notify();
}

function stopHard(): void {
  playEpoch += 1;
  disarmUnlock();
  playing = false;

  if (!audio) return;

  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // ignore
  }

  audio.removeAttribute("src");
  try {
    audio.src = "";
    audio.load();
  } catch {
    // ignore
  }
}

export function subscribeAmbient(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAmbientSnapshot(): AmbientSnapshot {
  const track = findAmbientTrack(prefs.trackId);
  return {
    enabled: prefs.enabled,
    playing,
    volume: prefs.volume,
    trackId: track?.id ?? prefs.trackId,
    trackTitle: track?.title ?? "Nhạc nền",
    tracks: getAmbientCatalog(),
    error
  };
}

/**
 * Tai catalog tu API. Khong phat nhac o day — hydrate goi tryPlay sau.
 */
async function loadRemoteCatalog(): Promise<void> {
  if (catalogReady) return;
  if (catalogPromise) {
    await catalogPromise;
    return;
  }

  catalogPromise = (async () => {
    if (typeof fetch === "undefined") return;

    try {
      const response = await fetch("/api/ambient/tracks", {
        headers: { accept: "application/json" }
      });
      if (!response.ok) return;

      const body: unknown = await response.json();
      if (!body || typeof body !== "object") return;

      const payload = body as {
        tracks?: unknown;
        defaultId?: unknown;
      };
      if (!Array.isArray(payload.tracks)) return;

      const tracks: AmbientTrack[] = [];
      for (const item of payload.tracks) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (
          typeof row.id !== "string" ||
          typeof row.title !== "string" ||
          typeof row.src !== "string"
        ) {
          continue;
        }
        tracks.push({ id: row.id, title: row.title, src: row.src });
      }

      setAmbientCatalog(
        tracks,
        typeof payload.defaultId === "string" ? payload.defaultId : null
      );

      if (
        tracks.length > 0 &&
        !tracks.some((t) => t.id === prefs.trackId)
      ) {
        prefs = { ...prefs, trackId: getAmbientDefaultId() };
        persist();
      }
    } catch {
      // Giu catalog hien tai.
    } finally {
      catalogReady = true;
    }
  })();

  await catalogPromise;
}

let deferredStart: number | null = null;
let deferredIdle: number | null = null;

async function startAmbientAfterIdle(): Promise<void> {
  // Mac dinh tat: khong fetch catalog / khong tao Audio — tranh tranh mang voi feed.
  if (!prefs.enabled) return;
  await loadRemoteCatalog();
  notify();
  if (prefs.enabled) {
    await tryPlay();
  }
}

/** Choi thap nhat truoc khi tai catalog/audio — idle co the chay qua som. */
const AMBIENT_MIN_DELAY_MS = 3200;

/**
 * Doc preference ngay (UI dung); catalog + audio doi toi thieu ~3.2s
 * roi moi idle, tranh tranh bandwidth voi first paint.
 * Mo panel / bat nhac: ensureAmbientReady() van tai som.
 */
export function hydrateAmbientPrefs(): void {
  if (hydrated) return;
  hydrated = true;
  prefs = readAmbientPrefs();
  bindPageExit();
  notify();

  const kick = () => {
    deferredIdle = null;
    deferredStart = null;
    void startAmbientAfterIdle();
  };

  deferredStart = window.setTimeout(() => {
    deferredStart = null;
    if (typeof window.requestIdleCallback === "function") {
      deferredIdle = window.requestIdleCallback(kick, { timeout: 1500 });
    } else {
      kick();
    }
  }, AMBIENT_MIN_DELAY_MS);
}

/** Dam bao catalog da tai (mo panel / bat nhac truoc idle). */
export async function ensureAmbientReady(): Promise<void> {
  if (typeof window !== "undefined") {
    if (deferredIdle !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(deferredIdle);
      deferredIdle = null;
    }
    if (deferredStart !== null) {
      window.clearTimeout(deferredStart);
      deferredStart = null;
    }
  }

  if (!hydrated) {
    hydrated = true;
    prefs = readAmbientPrefs();
    bindPageExit();
  }

  await loadRemoteCatalog();
  notify();
}

export async function setAmbientEnabled(on: boolean): Promise<void> {
  // Tat truoc moi thu — chan unlock/tryPlay dang treo.
  if (!on) {
    prefs = { ...prefs, enabled: false };
    persist();
    stopHard();
    error = "";
    notify();
    return;
  }

  // UI doi ngay; catalog/audio co the cham hon.
  prefs = { ...prefs, enabled: true };
  persist();
  notify();

  await ensureAmbientReady();
  if (!prefs.enabled) return;
  await tryPlay();
}

export function setAmbientVolume(volume: number): void {
  prefs = { ...prefs, volume: clampVolume(volume) };
  persist();
  // iOS: chỉ GainNode có hiệu lực; desktop: gain hoặc element.volume.
  applyOutputVolume(prefs.volume);
  void resumeAudioContext();
  notify();
}

export async function setAmbientTrack(trackId: string): Promise<void> {
  const track = findAmbientTrack(trackId);
  if (!track) return;

  prefs = { ...prefs, trackId: track.id };
  persist();
  notify();

  if (!prefs.enabled) return;
  await tryPlay();
}
