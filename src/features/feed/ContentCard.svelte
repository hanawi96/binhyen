
<script lang="ts">
  import type { ContentItem } from "../content/content.types";

  interface Props {
    content: ContentItem;
    saved: boolean;
    onSaveChange: (next: boolean) => void;
  }

  let { content, saved, onSaveChange }: Props = $props();


  let fullDialog: HTMLDialogElement;

  const themeByCategory: Record<string, string> = {
    "Chữa lành & bình yên": "peace",
    "Kiến thức kỳ thú": "discovery",
    "Góc nhìn cuộc sống": "story",
    "Thiên nhiên kỳ thú": "nature",
    "Tâm lý học dễ hiểu": "psychology",
    "Những điều dễ thương": "cute"
  };

  function openFullText() {
    fullDialog?.showModal();
  }

  function closeFullText() {
    fullDialog?.close();
  }
</script>

<article
  class="content-card"
  data-theme={themeByCategory[content.category] ?? "peace"}
  aria-labelledby={`content-title-${content.id}`}
>
  <header class="card-header">
    <span class="category">
      <span class="category-icon" aria-hidden="true">✳</span>
      {content.category}
    </span>

    <span class="card-symbol" aria-hidden="true">✦</span>
  </header>

  <div class="card-body">
    <span class="quote-mark" aria-hidden="true">“</span>

    <h2 id={`content-title-${content.id}`} class="quote-text">
      {content.title}
    </h2>

    <p class="quote-description">
      {content.description}
    </p>
  </div>

  <footer class="card-footer">
    <span class="content-tag">{content.tag}</span>

    <div class="card-actions">
      <button
        type="button"
        class="read-button"
        onclick={openFullText}
      >
        Đọc đầy đủ
      </button>

      <button
        type="button"
        class="save-button"
        class:saved={saved}
        aria-pressed={saved}
        aria-label={saved ? "Bỏ lưu nội dung" : "Lưu nội dung"}
        onclick={() => onSaveChange(!saved)}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v16L12 16.5 4.5 21V5A1.5 1.5 0 0 1 6 3.5Z" />
        </svg>
        <span>{saved ? "Đã lưu" : "Lưu lại"}</span>
      </button>
    </div>
  </footer>
</article>

<!-- Hien thi toan bo noi dung khi can -->
<dialog
  bind:this={fullDialog}
  class="detail-dialog"
  aria-labelledby={`full-title-${content.id}`}
>
  <div class="detail-panel">
    <div class="detail-header">
      <span class="category">{content.category}</span>

      <button
        type="button"
        class="close-button"
        aria-label="Đóng"
        onclick={closeFullText}
      >
        ✕
      </button>
    </div>

    <h2 id={`full-title-${content.id}`}>
      {content.title}
    </h2>

    <p>{content.description}</p>

    <button
      type="button"
      class="close-text-button"
      onclick={closeFullText}
    >
      Quay lại khám phá
    </button>
  </div>
</dialog>

<style>
  .content-card {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: clamp(18px, 2.5vw, 30px);
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    background: var(--color-theme-peace);
    color: var(--color-text);
  }

  .card-header,
  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
  }

  .category {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.07em;
    line-height: 1.5;
    text-transform: uppercase;
  }

  .category-icon {
    font-size: var(--text-lg);
  }

  .card-symbol {
    flex-shrink: 0;
    color: var(--color-primary);
    font-size: var(--text-xl);
    opacity: 0.65;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    min-width: 0;
    min-height: 0;
    padding-block: clamp(8px, 1.5dvh, 18px);
    overflow: hidden;
  }

  .quote-mark {
    flex-shrink: 0;
    margin-bottom: var(--space-2);
    color: var(--color-primary);
    font-family: var(--font-editorial);
    font-size: clamp(2.5rem, 5dvh, 4rem);
    line-height: 0.85;
    opacity: 0.65;
  }

  .quote-text {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    line-clamp: 5;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(1.35rem, 3.15dvh, 2.15rem);
    font-weight: 400;
    line-height: 1.35;
    letter-spacing: -0.02em;
    overflow-wrap: break-word;
    text-wrap: pretty;
  }

  .quote-description {
    display: -webkit-box;
    max-width: 100%;
    margin-top: var(--space-3);
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--color-text-secondary);
    font-size: clamp(0.85rem, 1.65dvh, 0.95rem);
    line-height: 1.55;
    overflow-wrap: break-word;
  }

  .card-footer {
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .content-tag {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .read-button {
    min-height: 44px;
    padding: var(--space-2);
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .read-button:hover {
    text-decoration: underline;
  }

  .save-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--text-sm);
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .save-button:hover,
  .save-button.saved {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-surface);
  }

  /* Cua so doc day du */
  .detail-dialog {
    width: min(540px, calc(100vw - 32px));
    max-height: 85dvh;
    padding: 0;
    overflow: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .detail-dialog::backdrop {
    background: color-mix(
      in srgb,
      var(--color-text) 55%,
      transparent
    );
  }

  .detail-panel {
    padding: clamp(24px, 5vw, 42px);
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-8);
  }

  .close-button {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface-soft);
    color: var(--color-text);
  }

  .detail-panel h2 {
    font-family: var(--font-editorial);
    font-size: clamp(1.4rem, 4vw, 2rem);
    font-weight: 400;
    line-height: 1.55;
    overflow-wrap: break-word;
  }

  .detail-panel p {
    margin-top: var(--space-6);
    color: var(--color-text-secondary);
    font-size: var(--text-base);
    line-height: 1.9;
  }

  .close-text-button {
    min-height: 44px;
    margin-top: var(--space-8);
    padding: var(--space-3) var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface-soft);
    color: var(--color-primary);
    font-size: var(--text-sm);
  }

  @media (max-width: 700px) {
    .content-card {
      padding: 20px;
    }

    .content-tag {
      display: none;
    }

    .card-actions {
      justify-content: space-between;
      width: 100%;
    }

    .quote-text {
      font-size: clamp(1.3rem, 5vw, 1.8rem);
      -webkit-line-clamp: 6;
      line-clamp: 6;
    }
  }

  @media (max-height: 650px) {
    .content-card {
      padding: 16px;
    }

    .quote-mark {
      display: none;
    }

    .quote-text {
      font-size: 1.3rem;
      -webkit-line-clamp: 5;
      line-clamp: 5;
    }

    .quote-description {
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }

    .card-body {
      padding-block: var(--space-2);
    }
  }
  /* STEP7_CARD_THEMES */

  .content-card[data-theme="discovery"] {
    --card-background: var(--color-theme-discovery);
    --card-accent: var(--color-accent-discovery);
  }

  .content-card[data-theme="story"] {
    --card-background: var(--color-theme-story);
    --card-accent: var(--color-accent-story);
  }

  .content-card[data-theme="nature"] {
    --card-background: var(--color-theme-nature);
    --card-accent: var(--color-accent-nature);
  }

  .content-card[data-theme="psychology"] {
    --card-background: var(--color-theme-psychology);
    --card-accent: var(--color-accent-psychology);
  }

  .content-card[data-theme="cute"] {
    --card-background: var(--color-theme-cute);
    --card-accent: var(--color-accent-cute);
  }

  .content-card {
    background: var(
      --card-background,
      var(--color-theme-peace)
    );
  }

  .category,
  .card-symbol,
  .quote-mark,
  .read-button {
    color: var(
      --card-accent,
      var(--color-primary)
    );
  }

  @media (max-width: 600px) {
    .category {
      font-size: 0.66rem;
      letter-spacing: 0.04em;
    }

    .quote-text {
      line-height: 1.33;
    }

    .quote-description {
      line-height: 1.5;
    }
  }

  @media (max-width: 850px) and (max-height: 650px) {
    .quote-description {
      display: none;
    }

    .card-body {
      padding-block: var(--space-2);
    }
  }
</style>
