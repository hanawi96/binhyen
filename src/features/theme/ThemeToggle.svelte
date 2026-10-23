<script lang="ts">
  import { onMount } from "svelte";
  import { applyTheme, readTheme } from "./theme";

  let dark = $state(false);

  onMount(() => {
    dark = readTheme() === "dark";
  });

  function toggle() {
    dark = readTheme() !== "dark";
    applyTheme(dark ? "dark" : "light");
  }
</script>

<button
  type="button"
  class="theme-toggle"
  aria-pressed={dark}
  aria-label={dark ? "Bật giao diện sáng" : "Bật giao diện tối"}
  onclick={toggle}
>
  <svg class="moon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M14.5 2.6a8.4 8.4 0 1 0 6.9 12.2A7 7 0 1 1 14.5 2.6z"
    />
  </svg>
  <svg class="sun" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3.4" fill="currentColor" />
    <g
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    >
      <path d="M12 2.4v2.3M12 19.3v2.3M2.4 12h2.3M19.3 12h2.3" />
      <path d="M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3 5.1 18.9" />
    </g>
  </svg>
</button>

<style>
  .theme-toggle {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--color-line);
    border-radius: 50%;
    background: var(--color-glass);
    color: var(--color-primary);
  }

  .moon,
  .sun {
    width: 16px;
    height: 16px;
  }

  .sun {
    display: none;
  }

  :global(html[data-theme="dark"]) .moon {
    display: none;
  }

  :global(html[data-theme="dark"]) .sun {
    display: block;
  }
</style>
