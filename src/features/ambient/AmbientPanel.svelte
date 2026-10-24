<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import {
    getAmbientSnapshot,
    hydrateAmbientPrefs,
    setAmbientEnabled,
    setAmbientTrack,
    setAmbientVolume,
    subscribeAmbient,
    type AmbientSnapshot
  } from "./ambient-player";

  let open = $state(false);
  let snap = $state<AmbientSnapshot>(getAmbientSnapshot());
  let root = $state<HTMLDivElement | null>(null);
  const audible = $derived(snap.enabled && snap.playing);

  onMount(() => {
    hydrateAmbientPrefs();
    snap = getAmbientSnapshot();
    return subscribeAmbient(() => {
      snap = getAmbientSnapshot();
    });
  });

  onDestroy(() => {
    open = false;
  });

  function togglePanel() {
    open = !open;
  }

  function closePanel() {
    open = false;
  }

  async function togglePower() {
    await setAmbientEnabled(!snap.enabled);
  }

  function onVolume(event: Event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    setAmbientVolume(Number(target.value) / 100);
  }

  function onDocPointer(event: PointerEvent) {
    if (!open || !root) return;
    const target = event.target;
    if (target instanceof Node && root.contains(target)) return;
    closePanel();
  }

  onMount(() => {
    document.addEventListener("pointerdown", onDocPointer, true);
    return () => document.removeEventListener("pointerdown", onDocPointer, true);
  });
</script>

<div class="ambient" bind:this={root}>
  <button
    type="button"
    class="ambient-toggle"
    class:on={audible}
    class:off={!audible}
    aria-pressed={open}
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label={audible ? "Nhạc nền đang phát" : "Nhạc nền đang tắt"}
    onclick={togglePanel}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 18V6l11-2v12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="7" cy="18" r="2.4" fill="currentColor" />
      <circle cx="18" cy="16" r="2.4" fill="currentColor" />
      {#if !audible}
        <path
          class="mute-slash"
          d="M4 4l16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      {/if}
    </svg>
  </button>

  {#if open}
    <div
      class="ambient-sheet"
      role="dialog"
      aria-label="Nhạc thư giãn"
    >
      <div class="ambient-head">
        <p class="ambient-title">Nhạc thư giãn</p>
        <button
          type="button"
          class="ambient-power"
          class:on={snap.enabled}
          aria-pressed={snap.enabled}
          aria-label={snap.enabled ? "Tắt nhạc" : "Bật nhạc"}
          onclick={togglePower}
        >
          {snap.enabled ? "Tắt nhạc" : "Bật nhạc"}
        </button>
      </div>

      <label class="ambient-volume">
        <span>Âm lượng</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(snap.volume * 100)}
          disabled={!snap.enabled}
          oninput={onVolume}
        />
      </label>

      <p class="ambient-now">{snap.trackTitle}</p>

      <div class="ambient-tracks" role="listbox" aria-label="Chọn bài">
        {#each snap.tracks as track (track.id)}
          <button
            type="button"
            class="ambient-track"
            class:active={track.id === snap.trackId}
            role="option"
            aria-selected={track.id === snap.trackId}
            onclick={() => setAmbientTrack(track.id)}
          >
            {track.title}
          </button>
        {/each}
      </div>

      {#if snap.error}
        <p class="ambient-error" role="status">{snap.error}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ambient {
    position: relative;
    flex: 0 0 auto;
  }

  .ambient-toggle {
    display: inline-flex;
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

  .ambient-toggle.on {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  }

  .ambient-toggle.off {
    color: var(--color-text-muted);
  }

  .ambient-toggle svg {
    width: 16px;
    height: 16px;
  }

  .mute-slash {
    opacity: 0.95;
  }

  .ambient-sheet {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 20;
    display: grid;
    gap: 10px;
    width: min(240px, calc(100vw - 32px));
    padding: 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 14px);
    background: var(--color-surface);
    box-shadow: 0 10px 28px color-mix(in srgb, var(--color-text) 12%, transparent);
  }

  .ambient-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .ambient-title {
    margin: 0;
    color: var(--color-text);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .ambient-power {
    padding: 6px 10px;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: transparent;
    color: var(--color-text);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .ambient-power.on {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .ambient-volume {
    display: grid;
    gap: 4px;
    color: var(--color-text-secondary);
    font-size: 0.72rem;
  }

  .ambient-volume input {
    width: 100%;
    accent-color: var(--color-primary);
  }

  .ambient-now {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.72rem;
  }

  .ambient-tracks {
    display: grid;
    gap: 6px;
  }

  .ambient-track {
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: transparent;
    color: var(--color-text);
    font-size: 0.8rem;
    text-align: left;
  }

  .ambient-track.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .ambient-error {
    margin: 0;
    color: var(--color-error);
    font-size: 0.72rem;
  }
</style>
