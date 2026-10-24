<script lang="ts">
  import { onMount, type Snippet } from "svelte";

  let {
    open,
    behind = false,
    tall = false,
    title,
    onClose,
    children
  }: {
    open: boolean;
    behind?: boolean;
    tall?: boolean;
    title: string;
    onClose: () => void;
    children: Snippet;
  } = $props();

  const CLOSE_DISTANCE = 90;
  const uid = $props.id();
  const titleId = `sheet-title-${uid}`;

  let mounted = $state(false);
  let sheet = $state<HTMLElement | null>(null);
  let dragY = $state(0);
  let dragPointer = $state<number | null>(null);
  let dragStart = 0;

  let shown = $derived(open && mounted);

  $effect(() => {
    if (shown) sheet?.focus({ preventScroll: true });
  });

  function onGrabDown(event: PointerEvent) {
    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }

    dragPointer = event.pointerId;
    dragStart = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onGrabMove(event: PointerEvent) {
    if (event.pointerId !== dragPointer) return;
    dragY = Math.max(0, event.clientY - dragStart);
  }

  function onGrabEnd(event: PointerEvent) {
    if (event.pointerId !== dragPointer) return;

    dragPointer = null;
    const close = dragY > CLOSE_DISTANCE;
    dragY = 0;
    if (close) onClose();
  }

  onMount(() => {
    const timer = window.setTimeout(() => {
      mounted = true;
    }, 32);

    return () => window.clearTimeout(timer);
  });
</script>

<div
  class="sheet-scrim"
  class:shown
  class:behind
  aria-hidden="true"
  onclick={onClose}
></div>

<section
  class="sheet"
  class:shown
  class:behind
  class:tall
  class:dragging={dragPointer !== null}
  style:--drag-y="{dragY}px"
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
  tabindex="-1"
  inert={!open || behind}
  bind:this={sheet}
>
  <div
    class="sheet-grab"
    onpointerdown={onGrabDown}
    onpointermove={onGrabMove}
    onpointerup={onGrabEnd}
    onpointercancel={onGrabEnd}
  >
    <span class="sheet-grip" aria-hidden="true"></span>
    <header class="sheet-head">
      <h2 id={titleId}>{title}</h2>
      <button
        type="button"
        class="sheet-close"
        aria-label="Đóng"
        onclick={onClose}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />
        </svg>
      </button>
    </header>
  </div>

  {@render children()}
</section>

<style>
  .sheet-scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: var(--color-scrim);
    opacity: 0;
    pointer-events: none;
    transition: opacity 220ms ease;
  }

  .sheet-scrim.shown {
    opacity: 1;
    pointer-events: auto;
  }

  .sheet {
    position: fixed;
    left: 50%;
    bottom: 0;
    z-index: 31;
    display: flex;
    flex-direction: column;
    width: min(560px, 100%);
    max-height: 88dvh;
    border: 1px solid var(--color-sheet-line);
    border-bottom: 0;
    border-radius: 22px 22px 0 0;
    background: var(--color-sheet);
    box-shadow: 0 -12px 40px var(--color-sheet-shadow);
    color: var(--color-text);
    outline: none;
    transform: translate(-50%, 100%);
    visibility: hidden;
    transition:
      transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 200ms ease,
      visibility 0s linear 220ms;
  }

  .sheet.tall {
    height: min(88dvh, 760px);
  }

  .sheet.shown {
    transform: translate(-50%, var(--drag-y));
    visibility: visible;
    transition:
      transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 200ms ease,
      visibility 0s;
  }

  .sheet.dragging {
    transition: none;
  }

  .sheet-scrim.behind,
  .sheet.behind {
    opacity: 0;
    pointer-events: none;
  }

  .sheet-grab {
    flex: none;
    padding: 8px 18px 0 22px;
    touch-action: none;
    cursor: grab;
  }

  .sheet-grip {
    display: block;
    width: 36px;
    height: 4px;
    margin: 0 auto 6px;
    border-radius: 2px;
    background: var(--color-sheet-line);
  }

  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sheet-head h2 {
    margin: 0;
    color: var(--color-sheet-label);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .sheet-close {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--color-text-muted);
    border-radius: 50%;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
  }

  .sheet-close svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  @media (max-width: 640px) {
    .sheet {
      border-radius: 18px 18px 0 0;
    }

    .sheet-grab {
      padding: 8px 14px 0 16px;
    }
  }
</style>
