<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ContentItem } from "../content/content.types";
  import {
    imageAspectRatio,
    videoAspectRatio
  } from "../content/content-media";
  import CardPoll from "./CardPoll.svelte";

  interface Props {
    content: ContentItem;
    active?: boolean;
    leaving?: boolean;
    onRead?: () => void;
    actions?: Snippet;
    /** Nội dung dưới gợi ý đọc thêm (vd. pager bộ sưu tập). */
    below?: Snippet;
  }

  let {
    content,
    active = false,
    leaving = false,
    onRead,
    actions,
    below
  }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let playing = $state(false);

  const showImage = $derived(
    content.format === "image" && !!content.image?.url
  );
  const showVideo = $derived(
    content.format === "video" && !!content.video?.url
  );
  const showPoll = $derived(
    content.format === "poll" &&
      !!content.pollOptions &&
      content.pollOptions.length >= 2
  );
  const mediaMode = $derived(showImage || showVideo || showPoll);

  const imageRatio = $derived(imageAspectRatio(content.image));
  const videoRatio = $derived(videoAspectRatio(content.video));

  $effect(() => {
    const node = videoEl;
    if (!node || !showVideo) return;

    if (!active) {
      node.pause();
      playing = false;
      return;
    }

    let cancelled = false;
    void node
      .play()
      .then(() => {
        if (!cancelled) playing = true;
      })
      .catch(() => {
        /* Trình duyệt chặn autoplay — giữ nút phát. */
        if (!cancelled) playing = false;
      });

    return () => {
      cancelled = true;
      node.pause();
      playing = false;
    };
  });

  async function togglePlay() {
    const node = videoEl;
    if (!node) return;

    if (node.paused) {
      try {
        await node.play();
        playing = true;
      } catch {
        playing = false;
      }
      return;
    }

    node.pause();
    playing = false;
  }
</script>

<article
  class="stage reading"
  class:media={mediaMode}
  class:poll={showPoll}
  class:out={leaving}
  aria-labelledby={`content-title-${content.id}`}
>
  {#if actions}
    <div class="card-actions" data-feed-control>
      {@render actions()}
    </div>
  {/if}

  {#if showImage && content.image}
    <div class="frame" style={`aspect-ratio: ${imageRatio}`}>
      <img
        class="media-el"
        src={content.image.url}
        alt={content.image.alt || content.title}
        width={content.image.width ?? undefined}
        height={content.image.height ?? undefined}
        loading="lazy"
        decoding="async"
      />
    </div>
  {:else if showVideo && content.video}
    <div
      class="frame video-frame"
      style={`aspect-ratio: ${videoRatio}`}
      data-feed-control
    >
      <video
        bind:this={videoEl}
        class="media-el"
        src={content.video.url}
        poster={content.video.poster ?? undefined}
        playsinline
        muted
        loop
        preload="metadata"
        aria-label={content.video.alt || content.title}
        onplay={() => (playing = true)}
        onpause={() => (playing = false)}
        onended={() => (playing = false)}
      ></video>
      <button
        type="button"
        class="play"
        class:playing
        aria-label={playing ? "Tạm dừng video" : "Phát video"}
        onclick={() => void togglePlay()}
      >
        {#if !playing}
          <span class="play-icon" aria-hidden="true"></span>
        {/if}
      </button>
    </div>
  {:else if showPoll && content.pollOptions}
    <CardPoll
      contentId={content.id}
      options={content.pollOptions}
      {active}
    />
  {/if}

  <h2
    id={`content-title-${content.id}`}
    class="headline"
    class:under-media={mediaMode}
  >
    {content.title}
  </h2>

  {#if content.hasArticle}
    <button type="button" class="readmore" onclick={() => onRead?.()}>
      Vuốt sang để đọc thêm
      <svg
        class="readmore-icon"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5"
        />
      </svg>
    </button>
  {/if}

  {#if below}
    <div class="card-below">
      {@render below()}
    </div>
  {/if}
</article>

<style>
  .stage {
    /* Khoảng actions ↔ nội dung = nội dung ↔ gợi ý đọc thêm (đối xứng). */
    --chrome-gap: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 8px 28px 16px;
    overflow: hidden;
    text-align: center;
    background: transparent;
    color: var(--color-text);
  }

  .stage.media {
    /* Ảnh/poll co trước; tiêu đề không bị stage cắt chân chữ. */
    --content-gap: 14px;
    justify-content: center;
    gap: 0;
    padding-bottom: 20px;
  }

  .card-actions {
    display: flex;
    flex: 0 0 auto;
    flex-shrink: 0;
    justify-content: center;
    align-self: stretch;
    width: 100%;
    margin: 0 0 var(--chrome-gap);
    padding-inline: 4px;
  }

  /* Media/poll: icon → khối nội dung = nội dung → Đọc thêm (--chrome-gap). */
  .stage.media .frame,
  .stage.media :global(.poll) {
    margin: 0;
  }

  .stage.media .headline.under-media {
    margin-top: var(--content-gap);
  }

  @media (min-width: 641px) {
    .stage {
      padding: 8px 60px 16px;
    }

    .card-actions {
      display: none;
    }
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

  .frame {
    position: relative;
    flex: 0 1 auto;
    width: min(100%, 720px);
    max-height: min(62dvh, 100%);
    min-width: 0;
    min-height: 0;
    margin: 0 auto;
    overflow: hidden;
    border-radius: 14px;
    background: color-mix(in oklab, var(--color-text) 6%, transparent);
  }

  /* Chừa chỗ cố định cho tiêu đề (+ actions) — ảnh không nuốt hết chiều cao. */
  .stage.media .frame {
    max-height: min(58dvh, calc(100% - 4.5rem));
  }

  /* Cover full khung — tránh letterbox khi max-height làm lệch tỉ lệ khung. */
  .media-el {
    display: block;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    background: transparent;
  }

  .video-frame {
    touch-action: manipulation;
  }

  .play {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .play.playing {
    background: transparent;
  }

  .play:not(.playing) {
    background: color-mix(in srgb, #000 18%, transparent);
  }

  .play-icon {
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 14px 0 14px 22px;
    border-color: transparent transparent transparent
      color-mix(in srgb, #fff 92%, transparent);
    margin-left: 4px;
  }

  .headline {
    flex: 0 0 auto;
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

  /**
   * Tiêu đề dưới ảnh: bỏ line-clamp/-webkit-box (cắt descender serif),
   * không co trong flex — tránh bị .stage overflow cắt đáy.
   */
  .headline.under-media {
    display: block;
    max-width: min(100%, 720px);
    overflow: visible;
    font-size: clamp(22px, 3.4vw, 36px);
    line-height: 1.42;
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }

  /*
   * Khoảng nhìn headline → chữ «Đọc thêm» = --chrome-gap
   * (padding trên nằm trong gap; padding dưới chỉ để chạm dễ hơn).
   */
  .readmore {
    --readmore-pad-y: 10px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: calc(var(--chrome-gap) - var(--readmore-pad-y));
    padding: var(--readmore-pad-y) 14px;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 700;
  }

  .readmore-icon {
    width: 11px;
    height: 11px;
    flex: none;
  }

  /* Poll cao: giới hạn khối lựa chọn để cụm vẫn căn giữa cân. */
  .stage.poll :global(.poll) {
    flex: 0 1 auto;
    max-height: min(42dvh, 100%);
    overflow: auto;
    overscroll-behavior: contain;
  }

  .card-below {
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    width: 100%;
    margin-top: 0.85rem;
  }

  .card-below:empty {
    display: none;
  }

  @media (max-width: 640px) {
    .headline {
      font-size: clamp(30px, 8vw, 48px);
      letter-spacing: -0.02em;
      line-height: 1.38;
    }

    .headline.under-media {
      font-size: clamp(20px, 5.4vw, 28px);
      line-height: 1.45;
    }

    /* Cân đều hai bên — không còn chừa cột rail phải (đã chuyển thành hàng ngang). */
    .stage {
      padding: 8px 20px 12px;
    }

    .stage.media {
      padding-bottom: 18px;
    }

    .stage.media .frame {
      max-height: min(50dvh, calc(100% - 4.25rem));
    }
  }

  @media (max-height: 700px) {
    .ornament {
      display: none;
    }

    .headline {
      font-size: clamp(26px, 6vw, 40px);
      -webkit-line-clamp: 5;
      line-clamp: 5;
    }

    .headline.under-media {
      font-size: clamp(18px, 4.6vw, 26px);
    }

    .frame {
      max-height: min(52dvh, 100%);
    }

    .stage.media .frame {
      max-height: min(46dvh, calc(100% - 3.75rem));
    }
  }
</style>
