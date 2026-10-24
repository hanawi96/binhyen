<script lang="ts">
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
</script>

<aside class="sidebar">
  <a class="brand" href="/admin/contents">
    <span aria-hidden="true">✳</span>
    Bình Yên
  </a>
  <nav aria-label="Quản trị">
    <a
      href="/admin/contents"
      aria-current={current === "contents" ? "page" : undefined}
    >
      Quản lý nội dung
    </a>
    <a
      href="/admin/submissions"
      aria-current={current === "submissions" ? "page" : undefined}
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
    >
      Chủ đề &amp; tâm trạng
    </a>
    <a
      href="/admin/ambient"
      aria-current={current === "ambient" ? "page" : undefined}
    >
      Nhạc nền
    </a>
    <a
      href="/admin/collections"
      aria-current={current === "collections" ? "page" : undefined}
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
      <a class="side-action" href="/">
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

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-6) var(--space-4);
    border-right: 1px solid var(--color-border);
    background: var(--color-surface);
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

  .badge {
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

  @media (max-width: 900px) {
    .sidebar {
      position: sticky;
      top: 0;
      z-index: 2;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
    }

    .brand {
      padding-inline: 0;
    }

    .brand,
    nav a,
    .side-action {
      white-space: nowrap;
    }

    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.15rem;
      flex: 1 1 auto;
    }

    .side-foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin-top: 0;
      margin-left: auto;
      padding-top: 0;
      border-top: 0;
    }

    .theme-row {
      padding: 0.35rem 0.55rem 0.35rem 0.75rem;
    }

    .theme-label {
      display: none;
    }

    .side-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.15rem;
    }

    .side-action {
      width: auto;
      padding: 0.45rem 0.7rem;
    }
  }
</style>
