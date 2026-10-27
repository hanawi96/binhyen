<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import ThemeToggle from "../theme/ThemeToggle.svelte";

  interface Props {
    current:
      | "contents"
      | "submissions"
      | "catalog"
      | "ambient"
      | "collections"
      | "admins"
      | "users";
    onleave: () => void;
    pending?: number;
  }

  let { current, onleave, pending = 0 }: Props = $props();

  const DRAWER_MQ = "(max-width: 1023px)";
  const ADMIN_NAME_KEY = "binhyen-admin-name";

  let open = $state(false);
  let narrow = $state(false);
  let accountOpen = $state(false);
  let adminName = $state("Quản trị viên");
  let menuBtn = $state<HTMLButtonElement | null>(null);
  let panelEl = $state<HTMLElement | null>(null);
  let accountBtn = $state<HTMLButtonElement | null>(null);
  let accountPanel = $state<HTMLElement | null>(null);
  let media: MediaQueryList | null = null;

  let adminInitial = $derived(
    (adminName.trim().charAt(0) || "Q").toLocaleUpperCase("vi")
  );

  function setOpen(next: boolean) {
    open = next && narrow;
  }

  function toggle() {
    setOpen(!open);
  }

  function close() {
    setOpen(false);
    closeAccount();
  }

  function focusables(root: HTMLElement): HTMLElement[] {
    return [
      ...root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ].filter((node) => !node.hasAttribute("disabled") && node.tabIndex !== -1);
  }

  function closeAccount() {
    accountOpen = false;
  }

  function toggleAccount() {
    accountOpen = !accountOpen;
  }

  function leaveAdmin() {
    closeAccount();
    try {
      sessionStorage.removeItem(ADMIN_NAME_KEY);
    } catch {
      // Bo qua.
    }
    onleave();
  }

  function onDocPointer(event: PointerEvent) {
    if (!accountOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (accountPanel?.contains(target) || accountBtn?.contains(target)) {
      return;
    }
    closeAccount();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape" && accountOpen) {
      event.preventDefault();
      closeAccount();
      accountBtn?.focus();
      return;
    }

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
    document.addEventListener("pointerdown", onDocPointer);
    try {
      const saved = sessionStorage.getItem(ADMIN_NAME_KEY)?.trim();
      if (saved) adminName = saved;
    } catch {
      // Bo qua.
    }

    void fetch("/api/admin/me")
      .then((response) => response.json().catch(() => null))
      .then((body) => {
        const label =
          typeof body?.admin?.displayName === "string"
            ? body.admin.displayName.trim()
            : typeof body?.admin?.username === "string"
              ? body.admin.username.trim()
              : "";
        if (!label) return;
        adminName = label;
        try {
          sessionStorage.setItem(ADMIN_NAME_KEY, label);
        } catch {
          // Bo qua.
        }
      })
      .catch(() => {
        // Bo qua.
      });
  });

  onDestroy(() => {
    media?.removeEventListener("change", onMediaChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onKey);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("pointerdown", onDocPointer);
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
      <svg
        class="brand-mark"
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
          d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"
        />
      </svg>
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
      <svg
        class="brand-mark"
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
          d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"
        />
      </svg>
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
      <a
        href="/admin/users"
        aria-current={current === "users" ? "page" : undefined}
        onclick={close}
      >
        Người dùng
      </a>
      <a
        href="/admin/admins"
        aria-current={current === "admins" ? "page" : undefined}
        onclick={close}
      >
        Quản trị viên
      </a>
    </nav>

    <div class="side-foot">
      <div class="account" class:is-open={accountOpen}>
        <button
          bind:this={accountBtn}
          class="account-trigger"
          type="button"
          aria-expanded={accountOpen}
          aria-haspopup="dialog"
          aria-controls="admin-account-panel"
          onclick={toggleAccount}
        >
          <span class="account-avatar" aria-hidden="true">{adminInitial}</span>
          <span class="account-trigger-copy">
            <strong>{adminName}</strong>
            <span>Tài khoản quản trị</span>
          </span>
          <svg
            class="account-chevron"
            class:is-open={accountOpen}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m6 14 6-6 6 6"
            />
          </svg>
        </button>

        {#if accountOpen}
          <div
            bind:this={accountPanel}
            id="admin-account-panel"
            class="account-panel"
            role="dialog"
            aria-label="Thông tin tài khoản quản trị"
          >
            <div class="account-card">
              <span class="account-avatar is-lg" aria-hidden="true"
                >{adminInitial}</span
              >
              <div class="account-copy">
                <strong>{adminName}</strong>
                <span>Quản trị viên · Bình Yên</span>
              </div>
            </div>

            <a class="account-link" href="/admin/admins" onclick={close}>
              Quản lý tài khoản admin
            </a>

            <div class="theme-row">
              <span class="theme-label">Giao diện</span>
              <ThemeToggle />
            </div>

            <button
              class="leave-btn"
              type="button"
              onclick={leaveAdmin}
            >
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
              Đăng xuất
            </button>
          </div>
        {/if}
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
    overflow: visible;
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

  .brand-mark {
    width: 1.35rem;
    height: 1.35rem;
    flex: 0 0 auto;
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
    position: relative;
    z-index: 5;
    margin-top: auto;
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
    overflow: visible;
  }

  .account {
    position: relative;
    overflow: visible;
  }

  .account-trigger {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.55rem 0.65rem;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .account-trigger:hover,
  .account.is-open .account-trigger {
    border-color: var(--color-border);
    background: var(--color-surface-soft);
  }

  .account-avatar {
    display: grid;
    place-items: center;
    width: 2.15rem;
    height: 2.15rem;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-primary) 18%, transparent);
    color: var(--color-primary);
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .account-avatar.is-lg {
    width: 2.75rem;
    height: 2.75rem;
    font-size: 1.05rem;
  }

  .account-trigger-copy {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  .account-trigger-copy strong,
  .account-copy strong {
    overflow: hidden;
    color: var(--color-text);
    font-size: 0.9rem;
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-trigger-copy span,
  .account-copy span {
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: 0.72rem;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-chevron {
    width: 1rem;
    height: 1rem;
    color: var(--color-text-secondary);
    transition: transform 0.18s var(--ease-standard);
  }

  .account-chevron.is-open {
    transform: rotate(180deg);
  }

  .account-panel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 0.55rem);
    z-index: 30;
    display: grid;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow:
      0 12px 32px color-mix(in oklab, #0a100c 16%, transparent),
      0 2px 8px color-mix(in oklab, #0a100c 8%, transparent);
    animation: account-rise 0.2s var(--ease-standard) both;
  }

  .account-panel::after {
    content: "";
    position: absolute;
    left: 1.15rem;
    bottom: -6px;
    width: 10px;
    height: 10px;
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    transform: rotate(45deg);
  }

  :global(html[data-theme="dark"]) .account-panel {
    box-shadow:
      0 16px 40px color-mix(in oklab, #000 42%, transparent),
      0 2px 10px color-mix(in oklab, #000 28%, transparent);
  }

  .account-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
  }

  .account-copy {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .account-link {
    display: block;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 0.85rem;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .account-link:hover {
    border-color: color-mix(in oklab, var(--color-primary) 40%, var(--color-border));
    background: color-mix(in oklab, var(--color-primary) 8%, transparent);
  }

  .theme-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0.45rem 0.65rem;
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

  .leave-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    width: 100%;
    min-height: 2.5rem;
    padding: 0 0.85rem;
    border: 1px solid color-mix(in oklab, #c45c5c 28%, var(--color-border));
    border-radius: var(--radius-full);
    background: color-mix(in oklab, #c45c5c 8%, transparent);
    color: #c45c5c;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 650;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .leave-btn svg {
    width: 1.05rem;
    height: 1.05rem;
  }

  .leave-btn:hover {
    background: color-mix(in oklab, #c45c5c 16%, transparent);
    border-color: color-mix(in oklab, #c45c5c 45%, var(--color-border));
  }

  :global(html[data-theme="dark"]) .leave-btn {
    border-color: color-mix(in oklab, #e08a8a 30%, var(--color-border));
    background: color-mix(in oklab, #e08a8a 10%, transparent);
    color: #e08a8a;
  }

  :global(html[data-theme="dark"]) .leave-btn:hover {
    background: color-mix(in oklab, #e08a8a 18%, transparent);
  }

  @keyframes account-rise {
    from {
      opacity: 0;
      transform: translateY(0.45rem) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .account-panel,
    .account-chevron {
      animation: none;
      transition: none;
    }
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
