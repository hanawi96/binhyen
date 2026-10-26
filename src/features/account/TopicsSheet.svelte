<script lang="ts">
  import { onMount } from "svelte";
  import type { AccountUser } from "./account-client";
  import {
    MAX_PROFILE_TOPICS,
    chosenSlugs,
    ensureProfile,
    flushTopicsSave,
    peekProfile,
    scheduleTopics,
    subscribeProfile,
    subscribeSaveError,
    toggleChosen,
    topicKey
  } from "./profile-session";

  let {
    open,
    user,
    onClose,
    onTopicsCommitted
  }: {
    open: boolean;
    user: AccountUser;
    onClose: () => void;
    /** Gọi khi chủ đề đã lưu khác lúc mở sheet — để refresh feed. */
    onTopicsCommitted: (user: AccountUser, topicsChanged: boolean) => void;
  } = $props();

  const CLOSE_DISTANCE = 96;
  const uid = $props.id();
  const titleId = `topics-space-title-${uid}`;

  let mounted = $state(false);
  let panel = $state<HTMLElement | null>(null);
  let dragY = $state(0);
  let dragPointer = $state<number | null>(null);
  let dragStart = 0;
  let shown = $derived(open && mounted);

  let status = $state<"idle" | "loading" | "ready" | "error">("idle");
  let topics = $state<Array<{ slug: string; label: string; chosen: boolean }>>(
    []
  );
  let chosen = $state<string[]>([]);
  let hint = $state("");
  let saveError = $state("");
  /** Key chủ đề lúc mở sheet (sau hydrate) — so với lúc đóng để refresh. */
  let openKey = "";
  let hasBaseline = false;
  let loadedFor = "";
  let hydrateEpoch = 0;
  let sessionOpen = false;

  onMount(() => {
    const timer = window.setTimeout(() => {
      mounted = true;
    }, 16);
    return () => window.clearTimeout(timer);
  });

  $effect(() => {
    if (shown) panel?.focus({ preventScroll: true });
  });

  function paint(
    profile: {
      topics: Array<{ slug: string; label: string; chosen: boolean }>;
    },
    seedOpenKey: boolean
  ) {
    topics = profile.topics;
    chosen = chosenSlugs(profile);
    if (seedOpenKey) {
      openKey = topicKey(chosen);
      hasBaseline = true;
    }
    loadedFor = user.id;
    status = "ready";
  }

  async function hydrate() {
    const epoch = ++hydrateEpoch;
    const warm = peekProfile(user.id);
    if (warm) {
      paint(warm, !hasBaseline);
    } else {
      status = "loading";
    }

    const profile = await ensureProfile(user.id);
    if (epoch !== hydrateEpoch || !open) return;

    if (!profile) {
      if (status !== "ready") status = "error";
      return;
    }

    paint(profile, !hasBaseline);
  }

  function onToggle(slug: string) {
    const next = toggleChosen(chosen, slug);
    if (next.blocked) {
      hint = `Chọn tối đa ${MAX_PROFILE_TOPICS} chủ đề.`;
      return;
    }

    hint = "";
    saveError = "";
    chosen = next.chosen;
    const profile = scheduleTopics(user.id, next.chosen);
    if (profile) topics = profile.topics;
  }

  async function settleAfterClose(
    userId: string,
    baseline: string,
    ready: boolean
  ) {
    const result = await flushTopicsSave(userId);
    if (!ready) return;
    if (result && !result.ok) {
      // Sheet đã đóng — lần mở sau thấy trạng thái rollback.
      return;
    }

    const profile = peekProfile(userId);
    if (!profile) return;

    const key = topicKey(chosenSlugs(profile));
    if (key !== baseline) {
      onTopicsCommitted(result?.ok ? result.user : user, true);
    }
  }

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

  $effect(() => {
    if (open) {
      sessionOpen = true;
      openKey = "";
      hasBaseline = false;
      saveError = "";
      hint = "";
      void hydrate();
      return;
    }

    if (!sessionOpen) return;
    sessionOpen = false;
    const baseline = openKey;
    const ready = hasBaseline;
    const userId = user.id;
    openKey = "";
    hasBaseline = false;
    void settleAfterClose(userId, baseline, ready);
  });

  $effect(() => {
    if (!open) return;
    const stopProfile = subscribeProfile((profile) => {
      if (loadedFor !== user.id) return;
      topics = profile.topics;
      chosen = chosenSlugs(profile);
    });
    const stopError = subscribeSaveError((message) => {
      saveError = message ?? "";
    });
    return () => {
      stopProfile();
      stopError();
    };
  });

  $effect(() => {
    user.id;
    if (loadedFor && loadedFor !== user.id) {
      status = "idle";
      topics = [];
      chosen = [];
      openKey = "";
      hasBaseline = false;
      loadedFor = "";
      hint = "";
      saveError = "";
    }
  });

  let countLabel = $derived(
    chosen.length === 0
      ? "Chưa chọn chủ đề"
      : `Đã chọn ${chosen.length}/${MAX_PROFILE_TOPICS}`
  );
</script>

<div
  class="topics-space"
  class:shown
  class:dragging={dragPointer !== null}
  style:--topics-drag="{dragY}px"
  aria-hidden={!open}
>
  <button
    type="button"
    class="topics-veil"
    tabindex="-1"
    aria-label="Đóng chủ đề"
    onclick={onClose}
  ></button>

  <section
    class="topics-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    inert={!open}
    bind:this={panel}
  >
    <div
      class="topics-top"
      onpointerdown={onGrabDown}
      onpointermove={onGrabMove}
      onpointerup={onGrabEnd}
      onpointercancel={onGrabEnd}
    >
      <p class="topics-eyebrow">Điều bạn muốn gặp nhiều hơn</p>
      <div class="topics-head">
        <h2 id={titleId} class="topics-title-hero">Chủ đề</h2>
        <button
          type="button"
          class="topics-close"
          aria-label="Đóng"
          onclick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />
          </svg>
        </button>
      </div>
      <p class="topics-count" aria-live="polite">{countLabel}</p>
    </div>

    <div class="topics-body">
      {#if status === "loading" || status === "idle"}
        <div class="topics-chips" aria-hidden="true">
          {#each [0, 1, 2, 3, 4, 5] as index (index)}
            <span class="topics-chip topics-chip-ghost"></span>
          {/each}
        </div>
      {:else if status === "error"}
        <div class="topics-note">
          <p>Chưa tải được danh sách chủ đề.</p>
          <button type="button" class="topics-retry" onclick={() => void hydrate()}>
            Thử lại
          </button>
        </div>
      {:else}
        <div class="topics-chips" role="group" aria-label="Chủ đề bạn thích">
          {#each topics as topic (topic.slug)}
            <button
              type="button"
              class="topics-chip"
              class:on={topic.chosen}
              aria-pressed={topic.chosen}
              onclick={() => onToggle(topic.slug)}
            >
              {topic.label}
            </button>
          {/each}
        </div>
        <p class="topics-soft">
          Chạm để chọn hoặc bỏ. Thay đổi được lưu tự động.
        </p>
      {/if}

      <p
        class="topics-hint"
        class:is-error={Boolean(saveError)}
        aria-live="polite"
      >
        {saveError || hint}
      </p>
    </div>
  </section>
</div>

<style>
  .topics-space {
    position: absolute;
    inset: 0;
    z-index: 8;
    display: grid;
    place-items: stretch;
    min-height: 0;
    overflow: hidden;
    pointer-events: none;
    visibility: hidden;
    opacity: 0;
    transition:
      opacity 200ms ease,
      visibility 0s linear 200ms;
  }

  .topics-space.shown {
    pointer-events: auto;
    visibility: visible;
    opacity: 1;
    transition:
      opacity 200ms ease,
      visibility 0s;
  }

  .topics-veil {
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

  .topics-panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    overflow: hidden;
    margin: 0 auto;
    outline: none;
    transform: translateY(10px);
    opacity: 0;
    transition:
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 200ms ease;
  }

  .topics-space.shown .topics-panel {
    transform: translateY(var(--topics-drag, 0px));
    opacity: 1;
  }

  .topics-space.dragging .topics-panel {
    transition: none;
  }

  .topics-top {
    flex: none;
    padding: 16px 18px 0;
    touch-action: none;
  }

  .topics-eyebrow {
    margin: 0 0 6px;
    color: color-mix(in oklab, var(--color-text) 55%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .topics-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 4px;
  }

  .topics-title-hero {
    margin: 0;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(1.7rem, 6vw, 2.35rem);
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  .topics-close {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    margin: 2px -6px 0 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
  }

  .topics-close svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .topics-count {
    margin: 0 0 8px;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .topics-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px 18px 28px;
    -webkit-overflow-scrolling: touch;
  }

  .topics-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .topics-chip {
    min-height: 36px;
    padding: 7px 15px;
    border: 1px solid color-mix(in oklab, var(--color-text) 14%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-surface) 24%, transparent);
    color: var(--color-chip);
    font: inherit;
    font-size: 14px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
    transition:
      background 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }

  .topics-chip.on {
    border-color: var(--color-chip-active-line);
    background: var(--color-chip-active-bg);
    color: var(--color-chip-active);
  }

  .topics-chip-ghost {
    width: 88px;
    border-color: transparent;
    background: var(--color-surface-soft);
    pointer-events: none;
  }

  .topics-soft {
    margin: 14px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .topics-hint {
    min-height: 18px;
    margin: 10px 0 0;
    color: var(--color-text-secondary);
    font-size: 13px;
    line-height: 1.4;
  }

  .topics-hint.is-error {
    color: var(--color-error);
  }

  .topics-note {
    display: grid;
    gap: 10px;
    margin-top: 8px;
  }

  .topics-note p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 14px;
    line-height: 1.5;
  }

  .topics-retry {
    justify-self: start;
    padding: 8px 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
</style>
