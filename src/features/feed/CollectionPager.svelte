<script lang="ts">
  /** progress: chỉ số bài dạng số thực (0…total-1), gồm phần đang vuốt. */
  let {
    progress = 0,
    total = 0,
    maxDots = 5
  }: {
    progress?: number;
    total?: number;
    maxDots?: number;
  } = $props();

  const count = $derived(
    Math.max(0, Math.min(maxDots, Math.floor(total)))
  );

  const active = $derived.by(() => {
    if (count <= 1 || total <= 1) return 0;
    const clamped = Math.min(Math.max(progress, 0), total - 1);
    return (clamped / (total - 1)) * (count - 1);
  });

  function dotStyle(index: number): string {
    const distance = Math.min(1, Math.abs(index - active));
    const widen = 1 - distance;
    const width = 6 + 14 * widen;
    const opacity = 0.32 + 0.68 * widen;
    return `width:${width}px;opacity:${opacity}`;
  }
</script>

{#if count > 1}
  <div
    class="pager"
    role="navigation"
    aria-label="Vị trí trong bộ sưu tập"
    aria-hidden="true"
  >
    {#each { length: count } as _, index (index)}
      <span class="dot" style={dotStyle(index)}></span>
    {/each}
  </div>
{/if}

<style>
  .pager {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 7px;
    pointer-events: none;
  }

  .dot {
    display: block;
    height: 6px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 0 0 1px color-mix(in srgb, #000 18%, transparent);
    will-change: width, opacity;
  }
</style>
