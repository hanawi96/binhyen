<script lang="ts">
  import ThemeToggle from "../theme/ThemeToggle.svelte";

  interface Props {
    current: "contents" | "catalog";
    onleave: () => void;
  }

  let { current, onleave }: Props = $props();
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
      href="/admin/catalog"
      aria-current={current === "catalog" ? "page" : undefined}
    >
      Chủ đề &amp; tâm trạng
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
