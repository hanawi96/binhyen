<script lang="ts">
  import type { ContentPollOption } from "../content/content.types";
  import type { PollState } from "../interactions/content-polls";
  import { fetchPollState, votePoll } from "./poll-client";

  interface Props {
    contentId: string;
    options: ContentPollOption[];
    active?: boolean;
  }

  let { contentId, options, active = false }: Props = $props();

  let state = $state<PollState | null>(null);
  let voting = $state(false);
  let hydratedId = $state<string | null>(null);

  $effect(() => {
    if (!active) return;
    if (hydratedId === contentId && state) return;

    const controller = new AbortController();
    const id = contentId;

    void fetchPollState(id, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      hydratedId = id;
      if (next) state = next;
    });

    return () => controller.abort();
  });

  async function choose(optionId: string) {
    if (voting || state?.revealed) return;
    voting = true;
    const next = await votePoll(contentId, optionId);
    voting = false;
    if (next) {
      state = next;
      hydratedId = contentId;
    }
  }

  const rows = $derived(
    state?.options?.length
      ? state.options
      : options.map((option) => ({
          id: option.id,
          label: option.label,
          votes: null as number | null,
          percent: null as number | null
        }))
  );

  const revealed = $derived(state?.revealed === true);
</script>

<ul class="poll" data-feed-control aria-label="Khảo sát">
  {#each rows as option (option.id)}
    <li>
      {#if revealed}
        <div
          class="result"
          class:picked={state?.votedOptionId === option.id}
        >
          <span class="label">{option.label}</span>
          <span class="pct">{option.percent ?? 0}%</span>
          <span
            class="bar"
            style={`--pct: ${option.percent ?? 0}%`}
            aria-hidden="true"
          ></span>
        </div>
      {:else}
        <button
          type="button"
          class="choice"
          disabled={voting}
          onclick={() => void choose(option.id)}
        >
          {option.label}
        </button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .poll {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(100%, 420px);
    margin: 0;
    padding: 0;
  }

  .choice {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--color-text) 14%, transparent);
    border-radius: 2px;
    background: transparent;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(18px, 2.6vw, 22px);
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.35;
    text-align: left;
    cursor: pointer;
    transition: border-color 160ms ease, background 160ms ease;
  }

  .choice:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--color-primary) 55%, transparent);
    background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  }

  .choice:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  .result {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    padding: 12px 14px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--color-text) 10%, transparent);
    border-radius: 2px;
  }

  .result.picked {
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
  }

  .label {
    position: relative;
    z-index: 1;
    font-family: var(--font-editorial);
    font-size: clamp(18px, 2.6vw, 22px);
    letter-spacing: -0.02em;
    line-height: 1.35;
    text-align: left;
  }

  .pct {
    position: relative;
    z-index: 1;
    color: var(--color-primary);
    font-size: 13px;
    font-weight: 700;
    align-self: center;
  }

  .bar {
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--pct);
    max-width: 100%;
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    transition: width 280ms ease;
  }
</style>
