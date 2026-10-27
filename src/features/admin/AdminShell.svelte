<script lang="ts">
  import type { Snippet } from "svelte";

  import AdminNav from "./AdminNav.svelte";

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
    children: Snippet;
  }

  let { current, onleave, pending = 0, children }: Props = $props();
</script>

<div class="desk">
  <div class="shell">
    <AdminNav {current} {onleave} {pending} />
    {@render children()}
  </div>
</div>

<style>
  .desk {
    min-height: 100dvh;
    color: var(--color-text);
    background: var(--color-background);
  }

  .shell {
    display: grid;
    grid-template-columns: var(--admin-sidebar-width, 240px) minmax(0, 1fr);
    min-height: 100dvh;
  }

  /* ≤1023: một cột; nav tự chuyển top bar + drawer */
  @media (max-width: 1023px) {
    .shell {
      grid-template-columns: 1fr;
      /* auto + 1fr: topbar khong bi stretch — tranh day noi dung xuong giua man hinh */
      grid-template-rows: auto minmax(0, 1fr);
      align-content: start;
    }
  }
</style>
