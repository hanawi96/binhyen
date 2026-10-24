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
  <div class="side-links">
    <ThemeToggle />
    <a href="/">Xem trang chủ</a>
    <button type="button" onclick={onleave}>Rời phòng</button>
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
    font-weight: 650;
  }

  .brand span {
    color: var(--color-primary);
  }

  nav {
    display: grid;
    gap: var(--space-2);
  }

  nav a {
    padding: var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
  }

  nav a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
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

  .side-links {
    display: grid;
    gap: var(--space-2);
    margin-top: auto;
  }

  .side-links a,
  .side-links button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    text-align: left;
  }

  @media (max-width: 900px) {
    .sidebar {
      position: sticky;
      top: 0;
      z-index: 2;
      flex-direction: row;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
    }

    .brand,
    nav a,
    .side-links a,
    .side-links button {
      white-space: nowrap;
    }

    nav,
    .side-links {
      display: flex;
      flex-wrap: wrap;
      margin-top: 0;
    }
  }
</style>
