<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import ThemeToggle from "../theme/ThemeToggle.svelte";

  interface Props {
    current:
      | "contents"
      | "submissions"
      | "catalog"
      | "ambient"
      | "collections";
    onleave: () => void;
    pending?: number;
  }

  let { current, onleave, pending = 0 }: Props = $props();

  const DRAWER_MQ = "(max-width: 1023px)";

  let open = $state(false);
  let narrow = $state(false);
  let menuBtn = $state<HTMLButtonElement | null>(null);
  let panelEl = $state<HTMLElement | null>(null);
  let media: MediaQueryList | null = null;

  function setOpen(next: boolean) {
    open = next && narrow;
  }

  function toggle() {
    setOpen(!open);
  }

  function close() {
    setOpen(false);
  }

  function focusables(root: HTMLElement): HTMLElement[] {
    return [
      ...root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ].filter((node) => !node.hasAttribute("disabled") && node.tabIndex !== -1);
  }

  function onKey(event: KeyboardEvent) {
    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      menuBtn?.focus();
      return;
    }

    if (event.key !== "Tab" || !panelEl) return;

    const items = focusables(panelEl);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function onMediaChange() {
    narrow = media?.matches ?? false;
    if (!narrow) open = false;
  }

  onMount(() => {
    media = window.matchMedia(DRAWER_MQ);
    onMediaChange();
    media.addEventListener("change", onMediaChange);
    window.addEventListener("keydown", onKey);
  });

  onDestroy(() => {
    media?.removeEventListener("change", onMediaChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onKey);
    }
    if (typeof document !== "undefined") {
      document.body.style.removeProperty("overflow");
    }
  });

  $effect(() => {
    if (typeof document === "undefined") return;
    if (open) {
      document.body.style.overflow = "hidden";
      queueMicrotask(() => {
        const first = panelEl ? focusables(panelEl)[0] : null;
        first?.focus();
      });
    } else {
      document.body.style.removeProperty("overflow");
    }
  });
</script>

<div class="nav-root" data-open={open ? "true" : "false"}>
  <header class="topbar">
    <a class="brand top-brand" href="/admin/contents">
      <span aria-hidden="true">✳</span>
      Bình Yên
    </a>
    <div class="top-actions">
      {#if pending > 0}
        <a
          class="pending-chip"
          href="/admin/submissions"
          aria-label={`${pending > 99 ? "99+" : pending} bài chờ duyệt`}
        >
          {pending > 99 ? "99+" : pending}
        </a>
      {/if}
      <button
        bind:this={menuBtn}
        class="menu-btn"
        type="button"
        aria-expanded={open}
        aria-controls="admin-nav-panel"
        aria-label={open ? "Đóng menu" : "Mở menu"}
        onclick={toggle}
      >
        {#if open}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        {/if}
      </button>
    </div>
  </header>

  {#if open}
    <button
      class="scrim"
      type="button"
      aria-label="Đóng menu"
      onclick={close}
    ></button>
  {/if}

  <aside
    bind:this={panelEl}
    class="panel"
    class:is-open={open}
    id="admin-nav-panel"
    aria-hidden={narrow && !open ? "true" : undefined}
    inert={narrow && !open}
  >
    <a class="brand panel-brand" href="/admin/contents" onclick={close}>
      <span aria-hidden="true">✳</span>
      Bình Yên
    </a>
    <nav aria-label="Quản trị">
      <a
        href="/admin/contents"
        aria-current={current === "contents" ? "page" : undefined}
        onclick={close}
      >
        Quản lý nội dung
      </a>
      <a
        href="/admin/submissions"
        aria-current={current === "submissions" ? "page" : undefined}
        onclick={close}
      >
        Bài người dùng gửi
        {#if pending > 0}
          <span class="badge">
            {pending > 99 ? "99+" : pending}
            <span class="sr-only">bài chờ duyệt</span>
          </span>
        {/if}
      </a>
      <a
        href="/admin/catalog"
        aria-current={current === "catalog" ? "page" : undefined}
        onclick={close}
      >
        Chủ đề &amp; tâm trạng
      </a>
      <a
        href="/admin/ambient"
        aria-current={current === "ambient" ? "page" : undefined}
        onclick={close}
      >
        Nhạc nền
      </a>
      <a
        href="/admin/collections"
        aria-current={current === "collections" ? "page" : undefined}
        onclick={close}
      >
        Bộ sưu tập
      </a>
    </nav>

    <div class="side-foot">
      <div class="theme-row">
        <span class="theme-label">Giao diện</span>
        <ThemeToggle />
      </div>
      <div class="side-actions" role="group" aria-label="Liên kết nhanh">
        <a class="side-action" href="/" onclick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4.5 11.2 12 4.8l7.5 6.4M7 10.8V19h4.2v-4.2h1.6V19H17v-8.2"
            />
          </svg>
          Xem trang chủ
        </a>
        <button class="side-action is-leave" type="button" onclick={onleave}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M10 5.5H6.8A1.8 1.8 0 0 0 5 7.3v9.4A1.8 1.8 0 0 0 6.8 18.5H10M13.5 12H20m0 0-2.8-2.8M20 12l-2.8 2.8"
            />
          </svg>
          Rời phòng
        </button>
      </div>
    </div>
  </aside>
</div>

<style>
  .nav-root {
    display: contents;
  }

  .topbar {
    display: none;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-6) var(--space-4);
    border-right: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .top-brand {
    display: none;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline: var(--space-3);
    font-weight: 650;
    letter-spacing: 0.01em;
  }

  .brand span {
    color: var(--color-primary);
  }

  nav {
    display: grid;
    gap: 0.2rem;
  }

  nav a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0.65rem var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    line-height: 1.35;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  nav a:hover {
    background: color-mix(in oklab, var(--color-surface-soft) 70%, transparent);
    color: var(--color-text);
  }

  .badge,
  .pending-chip {
    min-width: 1.4rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--color-surface);
    font-size: 0.75rem;
    font-weight: 650;
    line-height: 1.4;
    text-align: center;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  nav a[aria-current="page"] {
    background: var(--color-theme-peace);
    color: var(--color-accent-peace);
    font-weight: 600;
  }

  nav a[aria-current="page"]:hover {
    background: var(--color-theme-peace);
    color: var(--color-accent-peace);
  }

  .side-foot {
    display: grid;
    gap: var(--space-3);
    margin-top: auto;
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
  }

  .theme-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0.55rem var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-surface-soft);
  }

  .theme-label {
    font-size: 0.82rem;
    font-weight: 550;
    letter-spacing: 0.02em;
    color: var(--color-text-secondary);
  }

  .theme-row :global(.theme-toggle) {
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .theme-row :global(.theme-toggle:hover) {
    background: color-mix(in oklab, var(--color-surface) 80%, transparent);
    color: var(--color-primary);
  }

  .side-actions {
    display: grid;
    gap: 0.15rem;
  }

  .side-action {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.55rem var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 0.9rem;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .side-action svg {
    flex: 0 0 auto;
    width: 1.05rem;
    height: 1.05rem;
    opacity: 0.85;
  }

  .side-action:hover {
    background: color-mix(in oklab, var(--color-surface-soft) 80%, transparent);
    color: var(--color-text);
  }

  .side-action.is-leave:hover {
    background: color-mix(in oklab, #c45c5c 12%, transparent);
    color: #c45c5c;
  }

  :global(html[data-theme="dark"]) .side-action.is-leave:hover {
    background: color-mix(in oklab, #e08a8a 14%, transparent);
    color: #e08a8a;
  }

  .scrim {
    display: none;
  }

  @media (max-width: 1023px) {
    .nav-root {
      display: block;
      position: sticky;
      top: 0;
      z-index: 40;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      min-height: 3.25rem;
      padding: 0.55rem var(--space-4);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }

    .top-brand {
      display: flex;
      padding-inline: 0;
    }

    .panel-brand {
      display: none;
    }

    .top-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .pending-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 1.75rem;
      padding-inline: 0.55rem;
      text-decoration: none;
    }

    .menu-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface-soft);
      color: var(--color-text);
      cursor: pointer;
    }

    .menu-btn svg {
      width: 1.35rem;
      height: 1.35rem;
    }

    .menu-btn:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }

    .scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 45;
      border: 0;
      background: color-mix(in oklab, #0a100c 48%, transparent);
      cursor: pointer;
    }

    :global(html[data-theme="dark"]) .scrim {
      background: color-mix(in oklab, #020403 72%, transparent);
    }

    .panel {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 50;
      width: min(20rem, 86vw);
      padding-top: max(var(--space-5), env(safe-area-inset-top));
      padding-bottom: max(var(--space-5), env(safe-area-inset-bottom));
      border-right: 1px solid var(--color-border);
      box-shadow: 8px 0 32px color-mix(in oklab, #000 18%, transparent);
      transform: translateX(-105%);
      transition: transform var(--duration-normal) var(--ease-standard);
      pointer-events: none;
    }

    .panel.is-open {
      transform: translateX(0);
      pointer-events: auto;
    }

    @media (prefers-reduced-motion: reduce) {
      .panel {
        transition: none;
      }
    }
  }
</style>
