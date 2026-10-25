<script lang="ts">
  import { onMount } from "svelte";

  import {
    clearDebugErrors,
    getDebugSnapshot,
    initDebugRuntime,
    setDebugEnabled,
    setDebugOpen,
    subscribeDebug,
    toggleDebugOpen,
    type DebugSnapshot
  } from "./debug-store";

  let snap = $state<DebugSnapshot>(getDebugSnapshot());

  onMount(() => {
    initDebugRuntime();
    snap = getDebugSnapshot();
    return subscribeDebug(() => {
      snap = getDebugSnapshot();
    });
  });

  function statusLabel(status: DebugSnapshot["checks"][number]["status"]) {
    if (status === "ok") return "Ổn";
    if (status === "warn") return "Cần xem";
    if (status === "wait") return "Đang đo";
    return "Tắt";
  }

  function turnOff() {
    setDebugEnabled(false);
  }

  function formatTime(at: number) {
    try {
      return new Date(at).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return "";
    }
  }
</script>

{#if snap.enabled}
  <button
    type="button"
    class="dbg-fab"
    class:open={snap.open}
    aria-expanded={snap.open}
    aria-controls="binhyen-debug-panel"
    onclick={toggleDebugOpen}
  >
    Debug
  </button>

  {#if snap.open}
    <div
      id="binhyen-debug-panel"
      class="dbg-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Bảng kiểm tra Bình Yên"
    >
      <header class="dbg-head">
        <div>
          <p class="dbg-eyebrow">Kiểm tra nhanh</p>
          <h2 class="dbg-title">Debug</h2>
        </div>
        <button
          type="button"
          class="dbg-close"
          aria-label="Đóng"
          onclick={() => setDebugOpen(false)}
        >
          Đóng
        </button>
      </header>

      <p class="dbg-lead">
        Xanh = ổn. Vàng = nên xem lại. Không cần biết code — chỉ đọc dòng chữ.
      </p>

      <ul class="dbg-checks">
        {#each snap.checks as check (check.id)}
          <li class="dbg-check" data-status={check.status}>
            <div class="dbg-check-top">
              <span class="dbg-badge">{statusLabel(check.status)}</span>
              <strong>{check.title}</strong>
            </div>
            <p class="dbg-detail">{check.detail}</p>
          </li>
        {/each}
      </ul>

      <section class="dbg-section">
        <div class="dbg-section-head">
          <h3>Lỗi vừa xảy ra</h3>
          {#if snap.errors.length > 0}
            <button type="button" class="dbg-link" onclick={clearDebugErrors}>
              Xóa danh sách
            </button>
          {/if}
        </div>
        {#if snap.errors.length === 0}
          <p class="dbg-empty">Chưa ghi nhận lỗi nào trong phiên này.</p>
        {:else}
          <ul class="dbg-errors">
            {#each snap.errors as err (err.at + err.message)}
              <li>
                <time>{formatTime(err.at)}</time>
                <span>{err.message}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      {#if snap.bootReady && snap.earlyRequests.length > 0}
        <details class="dbg-more">
          <summary>Chi tiết kỹ thuật (tuỳ chọn)</summary>
          <ul class="dbg-req">
            {#each snap.earlyRequests.slice(0, 40) as row}
              <li>
                <span>{row.startMs}ms</span>
                <code>{row.name}</code>
              </li>
            {/each}
          </ul>
        </details>
      {/if}

      <footer class="dbg-foot">
        <p>
          Bật lại sau: mở trang kèm <code>?debug=1</code>. Tắt hẳn:
          <code>?debug=0</code>.
        </p>
        <button type="button" class="dbg-off" onclick={turnOff}>
          Tắt debug
        </button>
      </footer>
    </div>
  {/if}
{/if}

<style>
  .dbg-fab {
    position: fixed;
    right: max(12px, env(safe-area-inset-right));
    bottom: max(72px, calc(env(safe-area-inset-bottom) + 64px));
    z-index: 80;
    padding: 10px 14px;
    border: 1px solid color-mix(in oklab, var(--color-text) 22%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-surface) 88%, transparent);
    color: var(--color-text);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 8px 24px color-mix(in oklab, var(--color-text) 12%, transparent);
    cursor: pointer;
  }

  .dbg-fab.open {
    background: var(--color-text);
    color: var(--color-surface);
  }

  .dbg-panel {
    position: fixed;
    inset: auto 12px 12px 12px;
    z-index: 81;
    max-width: 420px;
    max-height: min(78dvh, 640px);
    margin-left: auto;
    margin-right: max(12px, env(safe-area-inset-right));
    margin-bottom: max(12px, env(safe-area-inset-bottom));
    overflow: auto;
    padding: 18px 16px 16px;
    border: 1px solid color-mix(in oklab, var(--color-text) 16%, transparent);
    border-radius: 20px;
    background: color-mix(in oklab, var(--color-surface) 94%, transparent);
    color: var(--color-text);
    box-shadow: 0 18px 48px color-mix(in oklab, var(--color-text) 18%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .dbg-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .dbg-eyebrow {
    margin: 0 0 4px;
    color: color-mix(in oklab, var(--color-text) 55%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .dbg-title {
    margin: 0;
    font-family: var(--font-editorial);
    font-size: 1.75rem;
    font-weight: 500;
    letter-spacing: -0.03em;
  }

  .dbg-close,
  .dbg-link,
  .dbg-off {
    border: 0;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
  }

  .dbg-close {
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--color-text) 18%, transparent);
    font-size: 13px;
  }

  .dbg-lead {
    margin: 12px 0 16px;
    color: color-mix(in oklab, var(--color-text) 72%, transparent);
    font-size: 14px;
    line-height: 1.45;
  }

  .dbg-checks {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dbg-check {
    padding: 12px;
    border-radius: 14px;
    background: color-mix(in oklab, var(--color-background) 70%, transparent);
  }

  .dbg-check[data-status="ok"] {
    box-shadow: inset 3px 0 0 #2f8f5b;
  }

  .dbg-check[data-status="warn"] {
    box-shadow: inset 3px 0 0 #c48a1a;
  }

  .dbg-check[data-status="wait"] {
    box-shadow: inset 3px 0 0 color-mix(in oklab, var(--color-text) 28%, transparent);
  }

  .dbg-check-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .dbg-badge {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-text) 10%, transparent);
    font-size: 11px;
    font-weight: 700;
  }

  .dbg-check[data-status="ok"] .dbg-badge {
    background: color-mix(in oklab, #2f8f5b 22%, transparent);
    color: #1f6b43;
  }

  .dbg-check[data-status="warn"] .dbg-badge {
    background: color-mix(in oklab, #c48a1a 22%, transparent);
    color: #8a5f0d;
  }

  .dbg-detail {
    margin: 0;
    white-space: pre-wrap;
    color: color-mix(in oklab, var(--color-text) 70%, transparent);
    font-size: 13px;
    line-height: 1.4;
  }

  .dbg-section {
    margin-top: 18px;
  }

  .dbg-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }

  .dbg-section h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }

  .dbg-link {
    font-size: 12px;
    text-decoration: underline;
    opacity: 0.8;
  }

  .dbg-empty {
    margin: 0;
    color: color-mix(in oklab, var(--color-text) 60%, transparent);
    font-size: 13px;
  }

  .dbg-errors {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 8px;
  }

  .dbg-errors li {
    display: grid;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in oklab, #b42318 10%, transparent);
    font-size: 13px;
  }

  .dbg-errors time {
    color: color-mix(in oklab, var(--color-text) 55%, transparent);
    font-size: 11px;
  }

  .dbg-more {
    margin-top: 14px;
    font-size: 13px;
  }

  .dbg-more summary {
    cursor: pointer;
    font-weight: 600;
  }

  .dbg-req {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
    max-height: 160px;
    overflow: auto;
  }

  .dbg-req li {
    display: grid;
    grid-template-columns: 52px 1fr;
    gap: 8px;
    font-size: 11px;
  }

  .dbg-req code {
    overflow-wrap: anywhere;
    font-family: ui-monospace, monospace;
  }

  .dbg-foot {
    display: grid;
    gap: 10px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid color-mix(in oklab, var(--color-text) 12%, transparent);
  }

  .dbg-foot p {
    margin: 0;
    color: color-mix(in oklab, var(--color-text) 65%, transparent);
    font-size: 12px;
    line-height: 1.4;
  }

  .dbg-foot code {
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }

  .dbg-off {
    justify-self: start;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--color-text) 20%, transparent);
    font-size: 13px;
    font-weight: 600;
  }
</style>
