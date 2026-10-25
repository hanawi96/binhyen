<script lang="ts">
  import { onMount } from "svelte";

  let {
    open,
    title,
    eyebrow = "Đang mở",
    onClose
  }: {
    open: boolean;
    title: string;
    eyebrow?: string;
    onClose: () => void;
  } = $props();

  const uid = $props.id();
  const titleId = `glass-pending-${uid}`;

  let mounted = $state(false);
  let shown = $derived(open && mounted);

  onMount(() => {
    const timer = window.setTimeout(() => {
      mounted = true;
    }, 16);
    return () => window.clearTimeout(timer);
  });
</script>

{#if open}
  <div
    class="glass-pending"
    class:shown
    aria-hidden={!open}
  >
    <button
      type="button"
      class="glass-pending-veil"
      tabindex="-1"
      aria-label="Đóng"
      onclick={onClose}
    ></button>

    <section
      class="glass-pending-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy="true"
    >
      <div class="glass-pending-top">
        <p class="glass-pending-eyebrow">{eyebrow}</p>
        <div class="glass-pending-head">
          <h2 id={titleId} class="glass-pending-title">{title}</h2>
          <button
            type="button"
            class="glass-pending-close"
            aria-label="Đóng"
            onclick={onClose}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />
            </svg>
          </button>
        </div>
      </div>
      <div class="glass-pending-body" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </section>
  </div>
{/if}

<style>
  .glass-pending {
    position: absolute;
    inset: 0;
    z-index: 8;
    display: grid;
    place-items: stretch;
    pointer-events: none;
    visibility: hidden;
    opacity: 0;
    transition:
      opacity 200ms ease,
      visibility 0s linear 200ms;
  }

  .glass-pending.shown {
    pointer-events: auto;
    visibility: visible;
    opacity: 1;
    transition:
      opacity 200ms ease,
      visibility 0s;
  }

  .glass-pending-veil {
    position: absolute;
    inset: 0;
    z-index: 0;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }

  .glass-pending-panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    max-height: 100%;
    margin: 0 auto;
    transform: translateY(10px);
    opacity: 0;
    transition:
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 200ms ease;
  }

  .glass-pending.shown .glass-pending-panel {
    transform: translateY(0);
    opacity: 1;
  }

  .glass-pending-top {
    flex: none;
    padding: 16px 18px 0;
  }

  .glass-pending-eyebrow {
    margin: 0 0 6px;
    color: color-mix(in oklab, var(--color-text) 55%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .glass-pending-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .glass-pending-title {
    margin: 0;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(1.7rem, 6vw, 2.35rem);
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  .glass-pending-close {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    margin-top: 4px;
    padding: 0;
    border: 1px solid color-mix(in oklab, var(--color-text) 22%, transparent);
    border-radius: 50%;
    background: color-mix(in oklab, var(--color-surface) 42%, transparent);
    color: var(--color-text);
    cursor: pointer;
  }

  .glass-pending-close svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .glass-pending-body {
    display: grid;
    gap: 14px;
    padding: 36px 22px;
  }

  .glass-pending-body span {
    display: block;
    height: 12px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-surface) 48%, transparent);
    animation: glass-pending-pulse 1.1s ease-in-out infinite;
  }

  .glass-pending-body span:nth-child(1) {
    width: 42%;
  }

  .glass-pending-body span:nth-child(2) {
    width: 78%;
    animation-delay: 0.12s;
  }

  .glass-pending-body span:nth-child(3) {
    width: 58%;
    animation-delay: 0.24s;
  }

  @keyframes glass-pending-pulse {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 0.85;
    }
  }

  @media (max-width: 640px) {
    .glass-pending-top,
    .glass-pending-body {
      padding-left: 16px;
      padding-right: 16px;
    }
  }
</style>
