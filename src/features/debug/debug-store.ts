/**
 * Bộ nhớ debug cho người không chuyên code.
 * Bật: mở trang với ?debug=1 (giữ mãi đến khi tắt trong panel hoặc ?debug=0)
 */

export const DEBUG_FLAG = "binhyen-debug";
const BOOT_WINDOW_MS = 1800;
const BOOT_REPORT_AFTER_MS = 2200;
const MAX_ERRORS = 30;

export type CheckStatus = "ok" | "warn" | "wait" | "off";

export interface DebugCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

export interface DebugError {
  at: number;
  message: string;
}

export interface DebugSnapshot {
  enabled: boolean;
  open: boolean;
  checks: DebugCheck[];
  errors: DebugError[];
  earlyRequests: Array<{ startMs: number; name: string }>;
  bootReady: boolean;
}

type Listener = () => void;

let enabled = false;
let open = false;
let bootReady = false;
let checks: DebugCheck[] = [
  {
    id: "boot",
    title: "Tải trang nhẹ (2 giây đầu)",
    status: "wait",
    detail: "Đang đo…"
  },
  {
    id: "ambient",
    title: "Nhạc nền không chen lúc mở trang",
    status: "wait",
    detail: "Đang đo…"
  },
  {
    id: "reactions",
    title: "Không hỏi thích/lưu dư lúc mở trang",
    status: "wait",
    detail: "Đang đo…"
  },
  {
    id: "sheets",
    title: "Không tải sẵn mã Của tôi / Viết / Tài khoản",
    status: "wait",
    detail: "Đang đo…"
  }
];
let errors: DebugError[] = [];
let earlyRequests: Array<{ startMs: number; name: string }> = [];
const listeners = new Set<Listener>();
let hooksBound = false;
let bootTimer = 0;

function notify(): void {
  for (const listener of listeners) listener();
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(DEBUG_FLAG) === "1";
  } catch {
    return false;
  }
}

function writeFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEBUG_FLAG, "1");
    else localStorage.removeItem(DEBUG_FLAG);
  } catch {
    // private mode
  }
}

/** Đồng bộ ?debug=1|0 trên URL rồi dọn query cho gọn. */
export function syncDebugFromUrl(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const param = url.searchParams.get("debug");
  if (param === "1") {
    writeFlag(true);
    enabled = true;
    url.searchParams.delete("debug");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  } else if (param === "0") {
    writeFlag(false);
    enabled = false;
    open = false;
    url.searchParams.delete("debug");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  } else {
    enabled = readFlag();
  }
}

export function isDebugEnabled(): boolean {
  return enabled;
}

export function setDebugEnabled(on: boolean): void {
  enabled = on;
  writeFlag(on);
  if (!on) open = false;
  if (on) startBootMeasure();
  notify();
}

export function setDebugOpen(next: boolean): void {
  open = next && enabled;
  notify();
}

export function toggleDebugOpen(): void {
  if (!enabled) return;
  open = !open;
  notify();
}

export function getDebugSnapshot(): DebugSnapshot {
  return {
    enabled,
    open,
    checks: checks.map((c) => ({ ...c })),
    errors: errors.map((e) => ({ ...e })),
    earlyRequests: earlyRequests.map((r) => ({ ...r })),
    bootReady
  };
}

export function subscribeDebug(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pushDebugError(message: string): void {
  if (!enabled) return;
  const text = message.trim().slice(0, 280);
  if (!text) return;
  errors = [{ at: Date.now(), message: text }, ...errors].slice(0, MAX_ERRORS);
  notify();
}

export function clearDebugErrors(): void {
  errors = [];
  notify();
}

function shortName(url: string): string {
  try {
    return url.replace(location.origin, "");
  } catch {
    return url;
  }
}

function classifyEarly(url: string): "ambient" | "reactions" | "sheets" | null {
  if (url.includes("/api/ambient/tracks") || url.includes("/api/media/audio/")) {
    return "ambient";
  }
  if (url.includes("/api/me/reactions")) return "reactions";
  if (url.includes("/api/contents/") && url.includes("/reactions")) {
    return "reactions";
  }
  // Chi canh bao JS sheet — CSS co the nam trong HTML ban dau (Astro), khong nang nhu ma.
  if (
    /MineSheet|AccountSheet|WriteSheet/.test(url) &&
    /\.m?js(\?|$)/.test(url)
  ) {
    return "sheets";
  }
  return null;
}

function startBootMeasure(): void {
  if (typeof window === "undefined" || !enabled) return;
  if (bootTimer) window.clearTimeout(bootTimer);

  bootReady = false;
  checks = checks.map((c) => ({
    ...c,
    status: "wait" as CheckStatus,
    detail: "Đang đo…"
  }));
  earlyRequests = [];
  notify();

  bootTimer = window.setTimeout(() => {
    const resources = performance.getEntriesByType(
      "resource"
    ) as PerformanceResourceTiming[];

    earlyRequests = resources
      .filter((entry) => entry.startTime < BOOT_WINDOW_MS)
      .map((entry) => ({
        startMs: Math.round(entry.startTime),
        name: shortName(entry.name)
      }))
      .sort((a, b) => a.startMs - b.startMs);

    const hits = {
      ambient: [] as string[],
      reactions: [] as string[],
      sheets: [] as string[]
    };

    for (const row of earlyRequests) {
      const kind = classifyEarly(row.name);
      if (kind) hits[kind].push(`${row.startMs}ms · ${row.name}`);
    }

    const next: DebugCheck[] = [
      {
        id: "boot",
        title: "Tải trang nhẹ (2 giây đầu)",
        status:
          hits.ambient.length + hits.reactions.length + hits.sheets.length === 0
            ? "ok"
            : "warn",
        detail:
          hits.ambient.length + hits.reactions.length + hits.sheets.length === 0
            ? "Không thấy việc nặng chen vào lúc mở trang."
            : "Vẫn còn vài việc sớm — xem chi tiết bên dưới."
      },
      {
        id: "ambient",
        title: "Nhạc nền không chen lúc mở trang",
        status: hits.ambient.length === 0 ? "ok" : "warn",
        detail:
          hits.ambient.length === 0
            ? "Ổn — nhạc chờ sau, không tranh mạng lúc mở."
            : hits.ambient.slice(0, 3).join("\n")
      },
      {
        id: "reactions",
        title: "Không hỏi thích/lưu dư lúc mở trang",
        status: hits.reactions.length === 0 ? "ok" : "warn",
        detail:
          hits.reactions.length === 0
            ? "Ổn — không gọi thêm API thích/lưu sớm."
            : hits.reactions.slice(0, 3).join("\n")
      },
      {
        id: "sheets",
        title: "Không tải sẵn mã Của tôi / Viết / Tài khoản",
        status: hits.sheets.length === 0 ? "ok" : "warn",
        detail:
          hits.sheets.length === 0
            ? "Ổn — mã sheet chỉ tải khi chạm nút (CSS nhẹ có thể có sẵn)."
            : hits.sheets.slice(0, 3).join("\n")
      }
    ];

    checks = next;
    bootReady = true;
    notify();
  }, BOOT_REPORT_AFTER_MS);
}

function bindErrorHooks(): void {
  if (hooksBound || typeof window === "undefined") return;
  hooksBound = true;

  window.addEventListener("error", (event) => {
    pushDebugError(event.message || "Lỗi không rõ");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Lỗi promise không xử lý";
    pushDebugError(message);
  });
}

/** Gọi một lần khi trang feed mount. */
export function initDebugRuntime(): void {
  if (typeof window === "undefined") return;
  syncDebugFromUrl();
  bindErrorHooks();
  if (enabled) startBootMeasure();
  notify();
}
