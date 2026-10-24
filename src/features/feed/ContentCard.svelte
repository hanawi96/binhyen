<script lang="ts">
  import type { ContentItem, ContentTheme } from "../content/content.types";

  interface Props {
    content: ContentItem;
    position: string;
    leaving?: boolean;
    onRead?: () => void;
  }

  let { content, position, leaving = false, onRead }: Props = $props();

  const ornaments: Record<ContentTheme, string> = {
    peace: "❋",
    discovery: "✧",
    story: "✳",
    nature: "❀",
    psychology: "☼",
    cute: "♡"
  };

</script>

<article
  class="stage reading"
  class:out={leaving}
  data-theme={content.theme}
  aria-labelledby={`content-title-${content.id}`}
>
  <p class="eyebrow">
    {content.category} · {position}
  </p>
  <div class="ornament" aria-hidden="true">
    {ornaments[content.theme]}
  </div>
  <h2 id={`content-title-${content.id}`} class="headline">
    {content.title}
  </h2>
  {#if content.description}
    <p class="subtext">{content.description}</p>
  {/if}
  <button type="button" class="readmore" onclick={() => onRead?.()}>
    Đọc thêm ↗
  </button>
</article>

<style>
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 8px 60px 16px;
    overflow: hidden;
    text-align: center;
    background: transparent;
    color: var(--color-text);
  }

  .reading {
    opacity: 1;
    transform: translateY(0);
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
  }

  .reading.out {
    opacity: 0;
    transform: translateY(-16px);
  }

  .eyebrow {
    margin-bottom: 18px;
    color: var(--color-eyebrow);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.22em;
    line-height: 1.6;
    text-transform: uppercase;
  }

  .ornament {
    margin-bottom: 12px;
    color: var(--color-ornament);
    font-family: var(--font-editorial);
    font-size: 34px;
    line-height: 1;
  }

  .headline {
    max-width: 820px;
    margin: 0;
    overflow: hidden;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(32px, 5vw, 66px);
    font-weight: 400;
    letter-spacing: -0.03em;
    line-height: 1.34;
    text-wrap: balance;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 6;
    line-clamp: 6;
  }

  .subtext {
    max-width: 520px;
    margin: 24px auto 0;
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: 13px;
    line-height: 1.9;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .readmore {
    margin-top: 24px;
    padding: 10px 14px;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 700;
  }

  @media (max-width: 640px) {
    .headline {
      font-size: clamp(30px, 8vw, 48px);
      letter-spacing: -0.02em;
      line-height: 1.38;
    }

    .subtext {
      font-size: 12px;
    }

    .stage {
      padding: 8px 52px 12px 12px;
    }
  }

  @media (max-height: 700px) {
    .ornament {
      display: none;
    }

    .eyebrow {
      margin-bottom: 10px;
    }

    .headline {
      font-size: clamp(26px, 6vw, 40px);
      -webkit-line-clamp: 5;
      line-clamp: 5;
    }

    .subtext {
      margin-top: 12px;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
  }
</style>
