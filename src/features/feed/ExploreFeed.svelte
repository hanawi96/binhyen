
<script lang="ts">
  import type { ContentItem } from "../content/content.types";
  import SwipeDeck from "./SwipeDeck.svelte";

  let {
    initialItems = [],
    initialCursor = null,
    initialMatched = true
  }: {
    initialItems?: ContentItem[];
    initialCursor?: string | null;
    initialMatched?: boolean;
  } = $props();
</script>

<div class="explore-page">
  <div class="page-container">
    <header class="site-header">
      <a class="brand" href="/" aria-label="Bình Yên - Trang chủ">
        <span class="brand-icon" aria-hidden="true">✳</span>
        <span class="brand-name">bình yên<span class="brand-dot">.</span></span>
      </a>

      <div class="header-caption">
        <span class="caption-dot" aria-hidden="true"></span>
        <span>Một góc nhỏ cho riêng bạn</span>
      </div>
    </header>

    <main class="main-content">
      <section class="intro" aria-labelledby="intro-title">
        <div class="intro-content">
          <p class="intro-eyebrow">
            MỘT KHOẢNG LẶNG GIỮA CUỘC SỐNG
          </p>

          <h1 id="intro-title">
            Có những điều
            <em>đẹp đẽ</em>
            đang chờ bạn.
          </h1>

          <p class="intro-description">
            Không vội vã. Không ồn ào.
            Chỉ là một nơi để bạn tìm thấy
            những câu chuyện, góc nhìn và
            khám phá nhỏ khiến cuộc sống
            trở nên dịu dàng hơn.
          </p>

          <div class="intro-decoration" aria-hidden="true">
            <span class="decoration-line"></span>
            <span class="decoration-star">✦</span>
            <span class="decoration-line"></span>
          </div>
        </div>
      </section>

      <section class="feed-section" aria-label="Không gian khám phá">
        <div class="feed-heading">
          <div class="feed-heading-left">
            <span class="feed-indicator" aria-hidden="true"></span>
            <span>ĐIỀU ĐẸP ĐẼ HÔM NAY</span>
          </div>

          <span class="feed-type">Một khoảng lặng</span>
        </div>

        <SwipeDeck
          {initialItems}
          {initialCursor}
          {initialMatched}
        />

        <p class="feed-hint">
          Mỗi ngày đều có những điều nhỏ bé đáng trân trọng.
        </p>
      </section>
    </main>

    <footer class="site-footer">
      <span>Được tạo ra cho những khoảnh khắc bình yên.</span>
      <span>✳</span>
    </footer>
  </div>
</div>

<style>
  .explore-page {
    min-height: 100vh;
    min-height: 100dvh;
    background:
      radial-gradient(
        circle at 10% 75%,
        var(--color-theme-peace),
        transparent 38%
      ),
      var(--color-background);
  }

  .page-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: var(--container-width);
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0 auto;
    padding: 24px clamp(20px, 3vw, 44px);
  }

  .site-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .brand-icon {
    font-size: 2rem;
    line-height: 1;
    color: var(--color-primary);
  }

  .brand-name {
    font-family: var(--font-editorial);
    font-size: 1.65rem;
    font-weight: 600;
    letter-spacing: -0.035em;
  }

  .brand-dot {
    color: var(--color-primary);
  }

  .header-caption {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
  }

  .caption-dot,
  .feed-indicator {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--color-primary);
  }

  .main-content {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 530px);
    align-items: center;
    gap: clamp(32px, 6vw, 90px);
    padding-block: var(--space-8);
  }

  .intro {
    display: flex;
    align-items: center;
  }

  .intro-content {
    width: 100%;
    max-width: 490px;
  }

  .intro-eyebrow {
    margin-bottom: var(--space-6);
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.14em;
    line-height: 1.6;
  }

  .intro h1 {
    font-family: var(--font-editorial);
    font-size: clamp(2.5rem, 4.3vw, 4rem);
    font-weight: 400;
    line-height: 1.25;
    letter-spacing: -0.04em;
  }

  .intro h1 em {
    display: block;
    color: var(--color-primary);
    font-weight: 400;
  }

  .intro-description {
    max-width: 390px;
    margin-top: var(--space-8);
    color: var(--color-text-secondary);
    font-size: var(--text-base);
    line-height: 1.95;
  }

  .intro-decoration {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 150px;
    margin-top: var(--space-12);
    color: var(--color-primary);
  }

  .decoration-line {
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }

  .decoration-star {
    font-size: 1.2rem;
  }

  .feed-section {
    width: 100%;
    min-width: 0;
  }

  .feed-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .feed-heading-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.09em;
  }

  .feed-type {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .feed-hint {
    margin-top: var(--space-5);
    color: var(--color-text-muted);
    font-family: var(--font-editorial);
    font-size: var(--text-sm);
    font-style: italic;
    text-align: center;
    line-height: 1.6;
  }

  .site-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .site-footer span:last-child {
    color: var(--color-primary);
    font-size: var(--text-xl);
  }

  @media (max-width: 850px) {
    .page-container {
      padding: 18px var(--space-4);
    }

    .main-content {
      display: flex;
      justify-content: center;
      padding-block: var(--space-5);
    }

    .intro {
      display: none;
    }

    .feed-section {
      width: 100%;
      max-width: 560px;
    }

    .site-footer {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .header-caption {
      font-size: 0;
    }

    .caption-dot {
      width: 8px;
      height: 8px;
    }

    .feed-heading-left {
      font-size: 0.65rem;
    }

    .feed-type {
      font-size: 0.7rem;
    }

    .feed-hint {
      font-size: var(--text-xs);
    }
  }
  /* STEP7_MOBILE_LAYOUT */

  @media (max-width: 850px) {
    .explore-page {
      height: 100dvh;
      min-height: 0;
      overflow: hidden;
    }

    .page-container {
      height: 100%;
      min-height: 0;
      padding-top: max(12px, env(safe-area-inset-top));
      padding-bottom: max(12px, env(safe-area-inset-bottom));
    }

    .site-header {
      min-height: 40px;
      flex-shrink: 0;
    }

    .main-content {
      flex: 1 1 auto;
      min-height: 0;
      align-items: stretch;
      padding-block: 10px 0;
    }

    .feed-section {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .feed-heading {
      flex: 0 0 auto;
      margin-bottom: 10px;
    }

    .feed-hint {
      display: none;
    }
  }

  /* Man hinh qua thap: cho cuon trang ngoai,
     khong tao scrollbar ben trong the. */

  @media (max-width: 850px) and (max-height: 540px) {
    .explore-page {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }

    .page-container {
      height: auto;
      min-height: 100dvh;
    }

    .main-content {
      flex: 1 0 auto;
    }

    .feed-section {
      height: auto;
    }
  }
</style>
