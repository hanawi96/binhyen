/**
 * Kiểm tra cold boot trang chủ.
 * Bật: localStorage.setItem("binhyen-boot-debug", "1") rồi hard reload.
 * Tắt: localStorage.removeItem("binhyen-boot-debug")
 *
 * Sau ~2.2s in ra các request sớm (startTime < 1800ms) — kỳ vọng KHÔNG thấy
 * ambient/tracks, media/audio, me/reactions, Mine/Account/Write chunks;
 * KHÔNG thấy contents/.../reactions khi khách (SSR đã gắn liked/saved).
 */
const FLAG = "binhyen-boot-debug";
const WINDOW_MS = 1800;
const REPORT_AFTER_MS = 2200;

function isEarlyBad(url: string): boolean {
  if (url.includes("/api/ambient/tracks")) return true;
  if (url.includes("/api/media/audio/")) return true;
  if (url.includes("/api/me/reactions")) return true;
  if (url.includes("/api/contents/") && url.includes("/reactions")) return true;
  if (/MineSheet|AccountSheet|WriteSheet/.test(url)) return true;
  return false;
}

export function scheduleHomeBootCheck(): void {
  if (typeof window === "undefined") return;

  try {
    if (localStorage.getItem(FLAG) !== "1") return;
  } catch {
    return;
  }

  window.setTimeout(() => {
    const resources = performance.getEntriesByType(
      "resource"
    ) as PerformanceResourceTiming[];

    const early = resources
      .filter((entry) => entry.startTime < WINDOW_MS)
      .map((entry) => ({
        startMs: Math.round(entry.startTime),
        name: entry.name.replace(location.origin, "")
      }))
      .sort((a, b) => a.startMs - b.startMs);

    const suspects = early.filter((row) => isEarlyBad(row.name));

    console.groupCollapsed(
      `[binhyen-boot] request trong ${WINDOW_MS}ms đầu (${early.length} resource)`
    );
    console.table(early);
    if (suspects.length === 0) {
      console.info(
        "✅ Không thấy ambient/audio/me/reactions/sheet chunk sớm — boot nhẹ OK."
      );
    } else {
      console.warn(
        "⚠️ Request sớm đáng nghi (có thể vẫn hợp lệ nếu có article/poll/ảnh):",
        suspects
      );
    }
    console.groupEnd();
  }, REPORT_AFTER_MS);
}
