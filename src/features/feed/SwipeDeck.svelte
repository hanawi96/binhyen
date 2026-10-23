
<script lang="ts">
  import { onMount } from "svelte";
  import ContentCard from "./ContentCard.svelte";
  import { demoContents } from "../content/demo-contents";
  import type { ContentItem } from "../content/content.types";
  import {
    createApiFeedSource,
    FeedLoadError,
    isFeedAbort
  } from "./api-feed-source";
  import type {
    TopicFilter,
    MoodFilter
  } from "../content/filter-contents";
  import { isMoodFilter, isTopicFilter } from "../content/filter-contents";
  import ThemeToggle from "../theme/ThemeToggle.svelte";
  import {
    readBlocks,
    splitSentences,
    type ArticleBlock
  } from "./read-blocks";

  let {
    initialItems = [],
    initialCursor = null,
    initialMatched = true
  }: {
    initialItems?: ContentItem[];
    initialCursor?: string | null;
    initialMatched?: boolean;
  } = $props();

  let selectedTopic = $state<TopicFilter>("all");
  let selectedMood = $state<MoodFilter>("all");
  let chipMode = $state<"topic" | "mood">("topic");
  let toast = $state("");
  let toastTimer = 0;

  const topicChips: Array<{ key: TopicFilter; label: string }> = [
    { key: "all", label: "Tất cả" },
    { key: "peace", label: "Bình yên" },
    { key: "stories", label: "Câu chuyện" },
    { key: "science", label: "Khoa học" },
    { key: "nature", label: "Thiên nhiên" },
    { key: "perspective", label: "Góc nhìn" },
    { key: "psychology", label: "Tâm lý" },
    { key: "cute", label: "Dễ thương" },
    { key: "tips", label: "Mẹo thú vị" }
  ];

  const moodChips: Array<{ key: MoodFilter; label: string }> = [
    { key: "all", label: "Tất cả" },
    { key: "calm", label: "Bình yên" },
    { key: "tired", label: "Mệt mỏi" },
    { key: "stressed", label: "Căng thẳng" },
    { key: "sad", label: "Buồn" },
    { key: "happy", label: "Vui vẻ" },
    { key: "curious", label: "Tò mò" }
  ];

  let activeChips = $derived(
    chipMode === "topic" ? topicChips : moodChips
  );

  // STEP12_FEED_BUFFER
  const PAGE_SIZE = 3;
  const PREFETCH_REMAINING = 1;
  const NEXT_PAGE_STATUS = "Đang chuẩn bị nội dung tiếp theo...";
  const OTHER_ITEMS_NOTE =
    "Chưa có nội dung cho lựa chọn này. Bạn đang xem những điều khác.";
  const END_NOTE = "Bạn đã xem hết những điều đang có.";
  const RESTART_LABEL = "Xem lại từ đầu";
  const RETRY_LABEL = "Thử lại";
  const LOAD_ERROR_MESSAGES = [
    "Hết thời gian chờ. Hãy thử lại.",
    "Không có kết nối. Hãy thử lại.",
    "Không thể tải thêm nội dung."
  ];

  let source = createApiFeedSource("all", "all");

  const startingCursor =
    initialItems.length > 0 ? initialCursor : "__first__";

  let contents = $state<ContentItem[]>(initialItems);
  let nextCursor: string | null = startingCursor;
  let hasMore = $state(startingCursor !== null);
  let loading = $state(false);
  let loadError = $state("");
  let directMatch = $state(initialMatched);
  let loadSerial = 0;
  let loadController: AbortController | null = null;
  // Trang loc moi thay ca bo the, khong noi vao the cu.
  let replaceOnLoad = $state(false);

  // Bo ket qua cu neu bo loc thay doi khi dang tai.
  let feedVersion = 0;

  const ANIMATION_MS = 400;
  const SWIPE_DISTANCE = 70;
  const MIN_FAST_DISTANCE = 30;
  const FAST_VELOCITY = 0.65;

  let deckElement: HTMLDivElement;

  let currentIndex = $state(0);
  let dragging = $state(false);
  let animating = $state(false);
  let progress = $derived(
    contents.length
      ? ((currentIndex + 1) / contents.length) * 100
      : 0
  );
  let reading = $state(false);
  let readerShown = $state(false);
  let articleBlocks = $state<ArticleBlock[]>([]);
  let articleReady = $state(false);
  let articleError = $state("");
  let readProgress = $state(0);
  let readScroll = $state<HTMLElement | null>(null);
  let readSerial = 0;
  let closeTimer = 0;

  const readMarks: Record<string, string> = {
    peace: "❋",
    discovery: "✧",
    story: "✳",
    nature: "❀",
    psychology: "☼",
    cute: "♡"
  };

  // STEP11_SESSION_HISTORY
  const seenIds = new Set<string>();
  let seenCount = $state(0);
  let pageVisible = $state(true);

  // Luu trang thai theo ID, khong theo component.
  let savedById = $state<Record<string, boolean>>({});

  // Chi render toi da 3 the.
  let visibleIndexes = $derived(
    [currentIndex - 1, currentIndex, currentIndex + 1]
      .filter((index) => index >= 0 && index < contents.length)
  );

  let canPrevious = $derived(currentIndex > 0);
  let canNext = $derived(currentIndex < contents.length - 1);
  let filtered = $derived(
    selectedTopic !== "all" || selectedMood !== "all"
  );
  let atEnd = $derived(
    contents.length > 0 &&
      currentIndex >= contents.length - 1 &&
      !hasMore &&
      !loading &&
      !loadError
  );
  let showingOtherItems = $derived(
    filtered && !directMatch && contents.length > 0 && !loadError
  );
  let showWaiting = $state(false);

  $effect(() => {
    const pending =
      contents.length === 0 && loading && !loadError;

    if (!pending) {
      showWaiting = false;
      return;
    }

    const timer = window.setTimeout(() => {
      showWaiting = true;
    }, 180);

    return () => window.clearTimeout(timer);
  });

  // Chi danh dau da xem khi the hien thi on dinh.
  // Khong danh dau cac the duoc preload.
  $effect(() => {
    const active = contents[currentIndex];

    if (
      !active ||
      dragging ||
      animating ||
      !pageVisible ||
      seenIds.has(active.id)
    ) {
      return;
    }

    const id = active.id;

    const timer = window.setTimeout(() => {
      if (
        document.hidden ||
        dragging ||
        animating ||
        contents[currentIndex]?.id !== id ||
        seenIds.has(id)
      ) {
        return;
      }

      seenIds.add(id);
      seenCount = seenIds.size;
    }, 900);

    return () => window.clearTimeout(timer);
  });

  // Pointer state
  let activePointerId: number | null = null;
  let startY = 0;
  let startTime = 0;
  let lastDistance = 0;

  // Animation state
  let pendingIndex: number | null = null;
  let dragFrame = 0;
  let transitionFrame1 = 0;
  let transitionFrame2 = 0;
  let fallbackTimer = 0;
  let queuedOffset = 0;
  let deckHeight = 1;

  function measureDeck() {
    if (!deckElement) return deckHeight;

    deckHeight = Math.max(deckElement.clientHeight, 1);
    return deckHeight;
  }

  function placeSlide(node: HTMLElement) {
    const previous = node.style.transition;
    node.style.transition = "none";

    const frame = requestAnimationFrame(() => {
      node.style.transition = previous;
    });

    return {
      destroy() {
        cancelAnimationFrame(frame);
      }
    };
  }

  function setOffset(value: number) {
    if (!deckElement) return;

    deckElement.style.setProperty(
      "--drag-offset",
      `${value}px`
    );
  }

  function cancelDragFrame() {
    if (dragFrame) {
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    }
  }

  function queueOffset(value: number) {
    queuedOffset = value;

    if (dragFrame) return;

    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      setOffset(queuedOffset);
    });
  }

  function clearTransitionTasks() {
    if (transitionFrame1) {
      cancelAnimationFrame(transitionFrame1);
      transitionFrame1 = 0;
    }

    if (transitionFrame2) {
      cancelAnimationFrame(transitionFrame2);
      transitionFrame2 = 0;
    }

    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
  }

  function completeTransition() {
    if (!animating) return;

    clearTransitionTasks();

    const nextIndex = pendingIndex;

    // Reset offset va cap nhat index trong cung mot lan.
    setOffset(0);

    if (nextIndex !== null) {
      currentIndex = nextIndex;
    }

    pendingIndex = null;
    animating = false;

    // Chi tai them sau khi chuyen the hoan tat.
    if (
      nextIndex !== null &&
      hasMore &&
      contents.length - currentIndex - 1 <= PREFETCH_REMAINING
    ) {
      void loadMore();
    }
  }

  function startTransition(nextIndex: number | null, targetOffset: number) {
    if (animating) return;

    dragging = false;
    animating = true;
    pendingIndex = nextIndex;

    // Ton trong cai dat giam chuyen dong.
    if (
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
    ) {
      completeTransition();
      return;
    }

    // Tach viec bo trang thai dragging va bat
    // transition sang hai khung hinh.
    transitionFrame1 = requestAnimationFrame(() => {
      transitionFrame1 = 0;

      transitionFrame2 = requestAnimationFrame(() => {
        transitionFrame2 = 0;

        setOffset(targetOffset);

        // Du phong truong hop transitionend khong chay.
        fallbackTimer = window.setTimeout(
          completeTransition,
          ANIMATION_MS + 150
        );
      });
    });
  }

  function loadErrorMessage(error: unknown): string {
    if (error instanceof FeedLoadError) {
      if (error.reason === "timeout") {
        return LOAD_ERROR_MESSAGES[0];
      }

      if (error.reason === "network") {
        return LOAD_ERROR_MESSAGES[1];
      }
    }

    return LOAD_ERROR_MESSAGES[2];
  }

  function cancelLoad() {
    loadSerial += 1;
    loadController?.abort();
    loadController = null;
  }

  async function loadMore(expectedVersion = feedVersion) {
    if (
      expectedVersion !== feedVersion ||
      loading ||
      !hasMore ||
      nextCursor === null
    ) {
      return;
    }

    const serial = ++loadSerial;
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;

    loading = true;
    loadError = "";

    const activeSource = source;
    const activeCursor = nextCursor;

    try {
      const page = await activeSource.loadPage(
        activeCursor,
        PAGE_SIZE,
        controller.signal
      );

      // Ket qua cua bo loc cu khong duoc chen vao feed moi.
      if (serial !== loadSerial || expectedVersion !== feedVersion) {
        return;
      }

      if (replaceOnLoad) {
        contents = page.items;
        currentIndex = 0;
        replaceOnLoad = false;
        setOffset(0);
      } else {
        const loadedIds = new Set(
          contents.map((item) => item.id)
        );

        const newItems = page.items.filter(
          (item) => !loadedIds.has(item.id)
        );

        contents = [...contents, ...newItems];
      }

      if (activeCursor === "__first__") {
        directMatch = page.matched !== false;
      }

      nextCursor = page.nextCursor;
      hasMore = nextCursor !== null;
    } catch (error) {
      if (
        serial !== loadSerial ||
        expectedVersion !== feedVersion ||
        isFeedAbort(error)
      ) {
        return;
      }

      loadError = loadErrorMessage(error);
    } finally {
      if (serial === loadSerial && expectedVersion === feedVersion) {
        loading = false;

        if (loadController === controller) {
          loadController = null;
        }
      }
    }
  }

  function retryLoad() {
    void loadMore();
  }
  function applyFilters(
    topic: TopicFilter,
    mood: MoodFilter
  ) {
    if (dragging || animating) return;

    const newSource = createApiFeedSource(topic, mood);

    const firstPage = newSource.firstPage(PAGE_SIZE);

    // Huy request cu roi mo phien feed moi.
    cancelLoad();
    feedVersion += 1;

    source = newSource;
    selectedTopic = topic;
    selectedMood = mood;

    nextCursor = firstPage.nextCursor;
    hasMore = nextCursor !== null;

    loading = false;
    loadError = "";
    directMatch = true;
    replaceOnLoad = true;

    setOffset(0);
    void loadMore();
  }

  function showAll() {
    applyFilters("all", "all");
  }

  function chooseTopic(value: string) {
    if (
      !isTopicFilter(value) ||
      dragging ||
      animating ||
      replaceOnLoad
    ) {
      return;
    }

    applyFilters(value, selectedMood);
  }

  function chooseMood(value: string) {
    if (
      !isMoodFilter(value) ||
      dragging ||
      animating ||
      replaceOnLoad
    ) {
      return;
    }

    applyFilters(selectedTopic, value);
  }

  function showToast(message: string) {
    toast = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast = "";
    }, 2200);
  }

  function toggleSave() {
    const item = contents[currentIndex];
    if (!item || dragging || animating) return;

    const next = !savedById[item.id];
    savedById[item.id] = next;
    showToast(next ? "Đã lưu nội dung." : "Đã bỏ lưu nội dung.");
  }

  let lastWheel = 0;
  let readingOut = $state(false);
  let fadeSwap = $state(false);
  let readingTimer = 0;
  let fadeSerial = 0;

  const READING_MS = 200;
  const WHEEL_COOLDOWN_MS = 580;

  function cancelFade() {
    fadeSerial += 1;
    window.clearTimeout(readingTimer);
    readingTimer = 0;
    readingOut = false;
    fadeSwap = false;
  }

  function fadeMove(direction: 1 | -1) {
    if (dragging || animating || replaceOnLoad) return;

    const nextIndex = currentIndex + direction;

    if (nextIndex < 0 || nextIndex >= contents.length) return;

    const serial = ++fadeSerial;
    animating = true;
    fadeSwap = true;
    readingOut = true;

    readingTimer = window.setTimeout(() => {
      if (serial !== fadeSerial) return;

      setOffset(0);
      currentIndex = nextIndex;

      readingTimer = window.setTimeout(() => {
        if (serial !== fadeSerial) return;

        readingOut = false;
        readingTimer = window.setTimeout(() => {
          if (serial !== fadeSerial) return;

          fadeSwap = false;
          animating = false;

          if (
            hasMore &&
            contents.length - currentIndex - 1 <= PREFETCH_REMAINING
          ) {
            void loadMore();
          }
        }, READING_MS);
      }, 32);
    }, READING_MS);
  }

  function articleBody(value: unknown): string | null {
    if (typeof value !== "object" || value === null) return null;
    if (!("success" in value) || value.success !== true) return null;
    if (!("article" in value)) return null;

    const article = value.article;

    if (typeof article !== "object" || article === null) return null;
    if (!("body" in article) || typeof article.body !== "string") return null;

    return article.body;
  }

  function measureRead() {
    if (!readScroll) return;

    const room = readScroll.scrollHeight - readScroll.clientHeight;
    readProgress =
      room <= 1 ? 100 : (readScroll.scrollTop / room) * 100;
  }

  function openReading() {
    const item = contents[currentIndex];
    if (!item || reading || animating || dragging || replaceOnLoad) return;

    window.clearTimeout(closeTimer);
    const serial = ++readSerial;
    articleBlocks = [];
    articleReady = false;
    articleError = "";
    readProgress = 0;
    reading = true;
    readerShown = false;

    window.setTimeout(() => {
      if (serial === readSerial) readerShown = true;
    }, 32);

    void fetch(`/api/contents/${encodeURIComponent(item.id)}`)
      .then(async (response) => {
        if (serial !== readSerial) return;
        if (!response.ok) {
          articleError = "Không mở được bài.";
          articleReady = true;
          return;
        }

        const body = articleBody(await response.json());

        if (serial !== readSerial) return;
        if (body === null) {
          articleError = "Không mở được bài.";
          articleReady = true;
          return;
        }

        let blocks = readBlocks(body);

        if (
          blocks[0]?.kind === "heading" &&
          blocks[0].text === item.title
        ) {
          blocks = blocks.slice(1);
        }

        if (blocks.length === 0 && item.description) {
          blocks = [{ kind: "paragraph", text: item.description }];
        }

        articleBlocks = blocks;
        articleReady = true;
        window.setTimeout(measureRead, 32);
      })
      .catch(() => {
        if (serial !== readSerial) return;
        articleError = "Không mở được bài.";
        articleReady = true;
      });
  }

  function closeReading() {
    if (!reading) return;

    readerShown = false;
    readSerial += 1;
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      reading = false;
      articleBlocks = [];
      articleReady = false;
      articleError = "";
      readProgress = 0;
    }, 200);
  }

  function readNext() {
    if (!canNext || animating) return;

    const nextIndex = currentIndex + 1;
    readerShown = false;
    readSerial += 1;
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      setOffset(0);
      currentIndex = nextIndex;
      reading = false;
      articleBlocks = [];
      articleReady = false;
      articleError = "";
      readProgress = 0;

      if (
        hasMore &&
        contents.length - nextIndex - 1 <= PREFETCH_REMAINING
      ) {
        void loadMore();
      }
    }, 200);
  }

  function readWheel(node: HTMLElement) {
    function onWheel(event: WheelEvent) {
      if (!readScroll || readScroll.scrollTop > 0 || event.deltaY >= -20) return;

      event.preventDefault();
      closeReading();
    }

    node.addEventListener("wheel", onWheel, { passive: false });

    return {
      destroy() {
        node.removeEventListener("wheel", onWheel);
      }
    };
  }

  function handleWheel(event: WheelEvent) {
    if (reading) return;
    if (deckElement?.querySelector("dialog[open]")) return;
    if (Math.abs(event.deltaY) < 20) return;

    const now = performance.now();
    if (now - lastWheel < WHEEL_COOLDOWN_MS) return;

    lastWheel = now;
    event.preventDefault();
    fadeMove(event.deltaY > 0 ? 1 : -1);
  }

  // Xem lai tu dau, giu chu de va tam trang dang chon.
  function restartSession() {
    if (dragging || animating) return;

    seenIds.clear();
    seenCount = 0;

    applyFilters(selectedTopic, selectedMood);
  }
  function navigate(direction: 1 | -1) {
    if (dragging || animating || replaceOnLoad) return;

    const nextIndex = currentIndex + direction;

    if (nextIndex < 0 || nextIndex >= contents.length) {
      return;
    }

    const height = measureDeck();

    startTransition(
      nextIndex,
      direction === 1 ? -height : height
    );
  }

  function getDragOffset(distance: number) {
    const limit = deckHeight * 0.95;

    let offset = Math.max(-limit, Math.min(limit, distance));

    // Luc can o dau va cuoi danh sach.
    if (
      (offset > 0 && !canPrevious) ||
      (offset < 0 && !canNext)
    ) {
      offset *= 0.25;
    }

    return offset;
  }

  function handlePointerDown(event: PointerEvent) {
    if (
      reading ||
      dragging ||
      animating ||
      replaceOnLoad ||
      !event.isPrimary
    ) {
      return;
    }

    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    const target = event.target;

    // Khong keo the khi dang thao tac nut hoac dialog.
    if (
      target instanceof Element &&
      target.closest(
        "button, a, input, textarea, select, dialog"
      )
    ) {
      return;
    }

    activePointerId = event.pointerId;
    startY = event.clientY;
    startTime = performance.now();
    lastDistance = 0;

    measureDeck();
    dragging = true;
    setOffset(0);

    deckElement.focus({ preventScroll: true });

    try {
      deckElement.setPointerCapture(event.pointerId);
    } catch {
      // Vuot van theo su kien tren the neu trinh duyet khong giu pointer.
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (
      !dragging ||
      activePointerId !== event.pointerId
    ) {
      return;
    }

    lastDistance = event.clientY - startY;

    // Chi cap nhat vi tri toi da mot lan moi frame.
    queueOffset(getDragOffset(lastDistance));
  }

  function finishDrag(
    event: PointerEvent,
    cancelled = false
  ) {
    if (
      !dragging ||
      activePointerId !== event.pointerId
    ) {
      return;
    }

    const distance = cancelled
      ? lastDistance
      : event.clientY - startY;

    const elapsed = Math.max(
      performance.now() - startTime,
      1
    );

    const velocity = Math.abs(distance) / elapsed;

    cancelDragFrame();

    const height = measureDeck();
    setOffset(getDragOffset(distance));

    activePointerId = null;

    if (deckElement.hasPointerCapture(event.pointerId)) {
      deckElement.releasePointerCapture(event.pointerId);
    }

    if (cancelled || Math.abs(distance) < 5) {
      startTransition(null, 0);
      return;
    }

    const shouldNavigate =
      Math.abs(distance) >= SWIPE_DISTANCE ||
      (
        Math.abs(distance) >= MIN_FAST_DISTANCE &&
        velocity >= FAST_VELOCITY
      );

    if (!shouldNavigate) {
      startTransition(null, 0);
      return;
    }

    const direction: 1 | -1 =
      distance < 0 ? 1 : -1;

    const nextIndex = currentIndex + direction;

    if (
      nextIndex < 0 ||
      nextIndex >= contents.length
    ) {
      startTransition(null, 0);
      return;
    }

    startTransition(
      nextIndex,
      direction === 1 ? -height : height
    );
  }

  function handleLostCapture(event: PointerEvent) {
    if (activePointerId === event.pointerId) {
      finishDrag(event, true);
    }
  }

  function handleTransitionEnd(
    event: TransitionEvent,
    index: number
  ) {
    if (!animating) return;

    if (event.propertyName !== "transform") return;

    if (event.target !== event.currentTarget) return;

    // Chi lay su kien tu the dang hien thi.
    if (index !== currentIndex) return;

    completeTransition();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (reading) return;
    if (event.target !== deckElement) return;

    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      navigate(1);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      navigate(-1);
    }
  }

  // STEP18_API_INTEGRATION
  onMount(() => {
    if (contents.length === 0) {
      void loadMore();
    }
    pageVisible = !document.hidden;

    function handleVisibilityChange() {
      pageVisible = !document.hidden;
      if (!document.hidden) return;

      if (activePointerId !== null) {
        const pointer = activePointerId;
        activePointerId = null;
        dragging = false;

        if (deckElement.hasPointerCapture(pointer)) {
          deckElement.releasePointerCapture(pointer);
        }
      }

      cancelDragFrame();

      if (animating) {
        if (fadeSwap) {
          cancelFade();
          animating = false;
        } else {
          completeTransition();
        }
      } else {
        setOffset(0);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !reading) return;

      event.preventDefault();
      closeReading();
    }

    document.addEventListener("keydown", handleEscape);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
    window.addEventListener("resize", measureDeck);
    window.visualViewport?.addEventListener(
      "resize",
      measureDeck
    );
    measureDeck();

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      window.removeEventListener("resize", measureDeck);
      window.visualViewport?.removeEventListener(
        "resize",
        measureDeck
      );

      cancelDragFrame();
      clearTransitionTasks();
      cancelLoad();
      window.clearTimeout(toastTimer);
      cancelFade();
      window.clearTimeout(closeTimer);
    };
  });
</script>

<div class="swipe-deck" class:is-reading={reading}>
  <header class="topbar">
    <a class="brand" href="/" aria-label="Bình Yên - Trang chủ" inert={reading}>
      <span aria-hidden="true">✳</span> Bình Yên
    </a>
    <div class="top-actions" inert={reading}>
      <button
        type="button"
        class="text-btn"
        aria-pressed={chipMode === "topic"}
        onclick={() => (chipMode = "topic")}
      >
        Chủ đề
      </button>
      <button
        type="button"
        class="pill-btn"
        aria-pressed={chipMode === "mood"}
        onclick={() => (chipMode = "mood")}
      >
        ♡ Tâm trạng
      </button>
      <ThemeToggle />
    </div>
  </header>
  <div
    class="deck-viewport"
    class:dragging={dragging}
    class:fade-swap={fadeSwap}
    inert={reading}
    bind:this={deckElement}
    tabindex="0"
    role="region"
    aria-label="Các nội dung khám phá"
    aria-roledescription="Bộ thẻ vuốt"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={(event) => finishDrag(event)}
    onpointercancel={(event) => finishDrag(event, true)}
    onlostpointercapture={handleLostCapture}
    onkeydown={handleKeydown}
    onwheel={handleWheel}
  >
    {#each visibleIndexes as index (contents[index].id)}
      {@const content = contents[index]}

      <div
        class="slide"
        use:placeSlide
        class:inactive={index !== currentIndex}
        aria-hidden={index !== currentIndex}
        inert={index !== currentIndex}
        style={`transform: translate3d(0, calc(${(index - currentIndex) * 100}% + var(--drag-offset, 0px)), 0);`}
        ontransitionend={(event) => handleTransitionEnd(event, index)}
      >
        <ContentCard
          {content}
          position={String(index + 1).padStart(2, "0")}
          leaving={readingOut && index === currentIndex}
          onRead={openReading}
        />
      </div>
    {/each}

    {#if showWaiting}
      <div class="empty-state" role="status">
        <span class="empty-icon" aria-hidden="true">✳</span>
        <h3>Một điều đẹp đẽ đang đến...</h3>
        <p>Đang chuẩn bị nội dung dành cho bạn.</p>
      </div>
    {/if}

    {#if contents.length === 0 && !loading && (loadError || !hasMore)}
      <div class="empty-state" role="status">
        <span class="empty-icon" aria-hidden="true">✳</span>

        <h3>
          {loadError
            ? "Không tải được nội dung"
            : filtered && !directMatch
              ? "Chưa có nội dung cho lựa chọn này"
              : "Chưa có nội dung"}
        </h3>

        <p>
          {loadError
            ? loadError
            : filtered && !directMatch
              ? "Hãy thử một chủ đề hoặc tâm trạng khác."
              : "Những điều đẹp đẽ sẽ xuất hiện khi có bài mới."}
        </p>

        <button
          type="button"
          onclick={loadError
            ? retryLoad
            : filtered && !directMatch
              ? showAll
              : restartSession}
        >
          {loadError
            ? "Thử tải lại"
            : filtered && !directMatch
              ? "Xem tất cả"
              : "Thử lại"}
        </button>
      </div>
    {/if}
  </div>

  <div class="chips-wrap" inert={reading}>
    <div class="chips" aria-label={chipMode === "topic" ? "Chủ đề" : "Tâm trạng"}>
      {#each activeChips as chip (chip.key)}
        <button
          type="button"
          class="chip"
          class:active={
            chipMode === "topic"
              ? chip.key === selectedTopic
              : chip.key === selectedMood
          }
          onclick={() =>
            chipMode === "topic"
              ? chooseTopic(chip.key)
              : chooseMood(chip.key)}
        >
          {chip.label}
        </button>
      {/each}
    </div>
  </div>

  <footer class="bottom" inert={reading}>
    <div class="left-tools">
      <button
        type="button"
        class="circle-btn"
        onclick={() => navigate(-1)}
        disabled={!canPrevious}
        aria-label="Xem nội dung trước"
      >
        ↑
      </button>
      <button
        type="button"
        class="circle-btn"
        class:saved={Boolean(contents[currentIndex] && savedById[contents[currentIndex].id])}
        aria-pressed={Boolean(contents[currentIndex] && savedById[contents[currentIndex].id])}
        aria-label={
          contents[currentIndex] && savedById[contents[currentIndex].id]
            ? "Bỏ lưu nội dung"
            : "Lưu nội dung"
        }
        disabled={!contents[currentIndex]}
        onclick={toggleSave}
      >
        {contents[currentIndex] && savedById[contents[currentIndex].id] ? "♥" : "♡"}
      </button>
    </div>

    <div class="next-zone">
      <span>CUỘN ĐỂ KHÁM PHÁ</span>
      <button
        type="button"
        onclick={() => navigate(1)}
        disabled={!canNext}
        aria-label="Nội dung tiếp theo"
      >
        ↓
      </button>
    </div>

    <div class="right-tools">
      <p class="counter" aria-live="polite" aria-atomic="true">
        <strong>{String(contents.length ? currentIndex + 1 : 0).padStart(2, "0")}</strong>
        / {String(contents.length).padStart(2, "0")}
      </p>
    </div>
  </footer>

  {#if reading && contents[currentIndex]}
    {@const item = contents[currentIndex]}
    <button
      type="button"
      class="close-read"
      class:shown={readerShown}
      onclick={closeReading}
      aria-label="Khép lại"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />
      </svg>
    </button>
    <article
      class="reader"
      class:shown={readerShown}
      use:readWheel
      aria-labelledby={`read-title-${item.id}`}
    >
      <div
        class="reader-scroll"
        bind:this={readScroll}
        onscroll={measureRead}
      >
      <div class="reader-column">
        <p class="reader-kicker">{item.category}</p>
        <div class="reader-mark" aria-hidden="true">
          {readMarks[item.theme] ?? "❋"}
        </div>
        <h2 id={`read-title-${item.id}`}>{item.title}</h2>

        {#if articleError}
          <p class="reader-wait">{articleError}</p>
        {:else if !articleReady}
          <p class="reader-wait">Đang mở bài…</p>
        {:else}
          {#each articleBlocks as block, index (`${block.kind}-${index}`)}
            {#if block.kind === "heading"}
              <h3>{block.text}</h3>
            {:else if block.kind === "quote"}
              <blockquote class="reader-graph">
                {#each splitSentences(block.text) as line, lineIndex (lineIndex)}
                  <span class="reader-line">
                    {#if lineIndex === 0}
                      <span class="reader-ornament" aria-hidden="true">{readMarks[item.theme] ?? "❋"}</span>
                    {/if}
                    {line}
                  </span>
                {/each}
              </blockquote>
            {:else}
              <p class="reader-graph">
                {#each splitSentences(block.text) as line, lineIndex (lineIndex)}
                  <span class="reader-line">{line}</span>
                {/each}
              </p>
            {/if}
          {/each}
          <p class="reader-end">Hết bài.</p>
          <button
            type="button"
            class="next-read"
            onclick={readNext}
            disabled={!canNext}
          >
            Bài kế
          </button>
        {/if}
      </div>
      </div>
    </article>
  {/if}

  <div
    class="progress"
    style:width="{reading ? readProgress : progress}%"
  ></div>

  <p class="loading-slot" aria-live="polite">
    {#if loading && !canNext}
      <span>{NEXT_PAGE_STATUS}</span>
    {/if}
    <span class="loading-slot-sizer" aria-hidden="true">
      {NEXT_PAGE_STATUS}
    </span>
  </p>

  <p class="other-items-slot" aria-live="polite">
    {#if showingOtherItems}
      <span>{OTHER_ITEMS_NOTE}</span>
    {/if}
    <span class="other-items-sizer" aria-hidden="true">
      {OTHER_ITEMS_NOTE}
    </span>
  </p>

  <div class="end-slot" aria-live="polite">
    {#if atEnd}
      <div class="end-slot-face">
        <span>{END_NOTE}</span>
        <button type="button" onclick={restartSession}>
          {RESTART_LABEL}
        </button>
      </div>
    {/if}
    <div class="end-slot-sizer" aria-hidden="true">
      <span>{END_NOTE}</span>
      <span class="end-slot-button">{RESTART_LABEL}</span>
    </div>
  </div>

  <div class="error-slot" aria-live="assertive">
    {#if loadError && contents.length > 0}
      <div class="error-slot-face" role="alert">
        <span>{loadError}</span>
        <button type="button" onclick={retryLoad}>
          {RETRY_LABEL}
        </button>
      </div>
    {/if}
    <div class="error-slot-sizer" aria-hidden="true">
      <span class="error-slot-copy">
        {#each LOAD_ERROR_MESSAGES as message (message)}
          <span>{message}</span>
        {/each}
      </span>
      <span class="error-slot-button">{RETRY_LABEL}</span>
    </div>
  </div>

  {#if import.meta.env.DEV}
    <p class="session-status">
      Đã xem trong phiên: {seenCount}
      · Đã tải: {contents.length} thẻ
      · {hasMore ? "Còn dữ liệu" : "Đã tải hết dữ liệu"}
    </p>
  {/if}

  <p class="toast" role="status" hidden={!toast}>{toast}</p>
</div>

<style>
  .swipe-deck {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }

  .deck-viewport {
    position: relative;
    width: 100%;
    height: clamp(440px, 66dvh, 620px);
    overflow: hidden;
    border-radius: var(--radius-xl);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: grab;
    overscroll-behavior: contain;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  .deck-viewport:focus,
  .deck-viewport:focus-visible {
    outline: none;
  }

  .deck-viewport.dragging {
    cursor: grabbing;
  }

  .slide {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    transition: transform var(--duration-slow) var(--ease-standard);
  }

  /* Trong luc keo, di chuyen truc tiep theo ngon tay. */
  .deck-viewport.dragging .slide,
  .deck-viewport.fade-swap .slide {
    transition: none;
  }

  .deck-viewport.fade-swap .slide.inactive :global(.reading) {
    opacity: 0;
    transform: translateY(-16px);
    transition: none !important;
  }

  .slide.inactive {
    pointer-events: none;
  }

  .slide :global(.content-card) {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .deck-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-5);
    margin-top: var(--space-4);
  }

  .nav-button {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-primary);
    font-size: var(--text-xl);
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .nav-button:hover:not(:disabled) {
    background: var(--color-primary);
    color: var(--color-surface);
  }

  .nav-button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .page-count {
    min-width: 65px;
    color: var(--color-text);
    font-size: var(--text-sm);
    font-weight: 600;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .separator {
    margin-inline: var(--space-2);
    color: var(--color-text-muted);
  }

  .swipe-hint {
    margin-top: var(--space-3);
    color: var(--color-text-muted);
    font-family: var(--font-editorial);
    font-size: var(--text-sm);
    font-style: italic;
    text-align: center;
  }

  @media (max-width: 600px) {
    .deck-viewport {
      height: clamp(390px, 68dvh, 620px);
    }

    .nav-button {
      width: 38px;
      height: 38px;
    }

    .swipe-hint {
      font-size: var(--text-xs);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .slide {
      transition-duration: 0.01ms;
    }
  }
  /* STEP7_RESPONSIVE_DECK */

  @media (max-width: 850px) {
    .swipe-deck {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }

    .deck-viewport {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
    }

    .deck-controls {
      flex: 0 0 auto;
      margin-top: 8px;
    }

    .swipe-hint {
      display: none;
    }
  }

  @media (max-width: 850px) and (max-height: 540px) {
    .topbar {
      padding-top: 10px;
    }

    .bottom {
      padding-top: 8px;
      padding-bottom: 10px;
    }

    .chips-wrap {
      margin-bottom: 2px;
    }
  }
  /* STEP 9: CONTENT FILTERS */

  .filter-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    flex-shrink: 0;
    margin-bottom: var(--space-3);
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .filter-field span {
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .filter-field select {
    display: block;
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .filter-field select:hover {
    border-color: var(--color-primary);
  }

  .filter-field select:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-6);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    background: var(--color-surface-soft);
    text-align: center;
  }

  .empty-icon {
    color: var(--color-primary);
    font-size: 2.5rem;
  }

  .empty-state h3 {
    font-family: var(--font-editorial);
    font-size: var(--text-xl);
    font-weight: 400;
  }

  .empty-state p {
    max-width: 280px;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.7;
  }

  .empty-state button {
    min-height: 44px;
    padding: var(--space-3) var(--space-5);
    border: none;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-surface);
    font-size: var(--text-sm);
  }

  @media (max-width: 600px) {
    .filter-row {
      gap: var(--space-2);
      margin-bottom: var(--space-2);
    }

    .filter-field select {
      font-size: var(--text-xs);
    }
  }
  /* STEP9_FILTER_VISIBILITY_FIX */

  .swipe-deck > .filter-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    flex: 0 0 auto;
    position: relative;
    z-index: 2;
    width: 100%;
    margin-bottom: 12px;
    visibility: visible;
    opacity: 1;
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .filter-field span {
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .filter-field select {
    display: block;
    width: 100%;
    min-height: 44px;
    min-width: 0;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  @media (max-width: 600px) {
    .swipe-deck > .filter-row {
      gap: var(--space-2);
    }

    .filter-field select {
      font-size: var(--text-xs);
    }
  }

  /* FILTER_UI_STYLE_FIX */

  .filter-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    flex: 0 0 auto;
    width: 100%;
    margin-bottom: var(--space-3);
    position: relative;
    z-index: 2;
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .filter-field span {
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .filter-field select {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .filter-field select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 600px) {
    .filter-row {
      gap: var(--space-2);
    }

    .filter-field span {
      font-size: 0.7rem;
    }

    .filter-field select {
      font-size: var(--text-xs);
      padding-inline: 8px;
    }
  }
  .loading-slot {
    display: grid;
    flex: 0 0 auto;
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
    text-align: center;
  }

  .loading-slot span {
    grid-area: 1 / 1;
  }

  .loading-slot-sizer {
    visibility: hidden;
  }

  .other-items-slot {
    display: grid;
    flex: 0 0 auto;
    margin-top: var(--space-3);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    line-height: 1.6;
    text-align: center;
  }

  .other-items-slot span {
    grid-area: 1 / 1;
  }

  .other-items-sizer {
    visibility: hidden;
  }

  .end-slot {
    display: grid;
    flex: 0 0 auto;
    margin-top: var(--space-3);
  }

  .end-slot-face,
  .end-slot-sizer {
    grid-area: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--space-3);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    line-height: 1.6;
    text-align: center;
  }

  .end-slot-sizer {
    visibility: hidden;
  }

  .end-slot button,
  .end-slot-button {
    box-sizing: border-box;
    min-height: 36px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    line-height: inherit;
  }

  .session-status {
    flex: 0 0 auto;
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    text-align: center;
  }

  .error-slot {
    display: grid;
    flex: 0 0 auto;
    margin-top: var(--space-2);
  }

  .error-slot-face,
  .error-slot-sizer {
    grid-area: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--space-3);
    color: var(--color-error);
    font-size: var(--text-xs);
    line-height: 1.6;
    text-align: center;
  }

  .error-slot-sizer {
    visibility: hidden;
  }

  .error-slot-copy {
    display: grid;
  }

  .error-slot-copy span {
    grid-area: 1 / 1;
  }

  .error-slot button,
  .error-slot-button {
    box-sizing: border-box;
    min-height: 36px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    line-height: inherit;
  }

  .swipe-deck {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: 0 0 auto;
    padding: 24px 30px 0;
  }

  .brand {
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 25px;
    letter-spacing: -0.04em;
    white-space: nowrap;
  }

  .brand span {
    color: var(--color-brand-mark);
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .text-btn,
  .pill-btn,
  .chip,
  .circle-btn,
  .next-zone button {
    font: inherit;
  }

  .text-btn {
    padding: 10px 12px;
    border: 0;
    background: transparent;
    color: var(--color-quiet);
    font-size: 12px;
  }

  .text-btn[aria-pressed="true"] {
    color: var(--color-primary);
  }

  .pill-btn {
    padding: 10px 14px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-full);
    background: var(--color-glass);
    color: var(--color-primary);
    font-size: 12px;
  }

  .pill-btn[aria-pressed="true"] {
    background: var(--color-chip-active-bg);
    border-color: var(--color-chip-active-line);
  }

  .deck-viewport {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
    border-radius: 0;
    background: transparent;
  }

  .empty-state {
    border: 0;
    background: transparent;
  }

  .chips-wrap {
    position: relative;
    z-index: 2;
    flex: 0 0 auto;
    width: min(760px, calc(100% - 32px));
    min-width: 0;
    max-width: 100%;
    margin: 0 auto 8px;
    pointer-events: none;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    pointer-events: auto;
  }

  .chip {
    max-width: 100%;
    padding: 9px 13px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-full);
    background: var(--color-glass-soft);
    color: var(--color-chip);
    font-size: 11px;
    white-space: nowrap;
  }

  .chip.active {
    border-color: var(--color-chip-active-line);
    background: var(--color-chip-active-bg);
    color: var(--color-chip-active);
  }

  .chip:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  .bottom {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    gap: 10px;
    flex: 0 0 auto;
    padding: 16px 30px 28px;
  }

  .left-tools,
  .right-tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .right-tools {
    justify-content: flex-end;
  }

  .circle-btn,
  .next-zone button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border: 1px solid var(--color-line);
    border-radius: 50%;
    background: var(--color-glass);
    color: var(--color-primary);
    font-size: 14px;
  }

  .next-zone button {
    background: transparent;
    font-size: 18px;
  }

  .circle-btn.saved {
    border-color: var(--color-saved-line);
    background: var(--color-saved-bg);
    color: var(--color-saved);
  }

  .circle-btn:disabled,
  .next-zone button:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }

  .next-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--color-hint);
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .counter {
    margin: 0;
    padding-bottom: 10px;
    color: var(--color-counter);
    font-size: 11px;
    text-align: right;
    white-space: nowrap;
  }

  .counter strong {
    color: var(--color-counter-strong);
    font-size: 16px;
    font-weight: 600;
  }

  .progress {
    position: absolute;
    left: 0;
    bottom: 0;
    z-index: 6;
    height: 2px;
    background: var(--color-progress);
    transition: width 0.28s ease;
  }

  .toast {
    position: absolute;
    left: 50%;
    bottom: 188px;
    z-index: 8;
    margin: 0;
    padding: 10px 15px;
    border-radius: var(--radius-full);
    background: var(--color-toast);
    color: var(--color-toast-text);
    font-size: 11px;
    white-space: nowrap;
    box-shadow: 0 8px 22px var(--color-toast-shadow);
    transform: translateX(-50%);
  }

  .toast[hidden] {
    display: none;
  }

  .loading-slot,
  .other-items-slot,
  .end-slot,
  .error-slot {
    position: absolute;
    top: 72px;
    right: 16px;
    bottom: auto;
    left: 16px;
    z-index: 4;
    margin: 0;
    pointer-events: none;
  }

  .loading-slot button,
  .end-slot button,
  .error-slot button {
    pointer-events: auto;
  }

  .session-status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  @media (max-width: 640px) {
    .topbar {
      padding: 18px 16px 0;
    }

    .brand {
      font-size: 22px;
    }

    .top-actions {
      gap: 4px;
    }

    .pill-btn,
    .text-btn {
      padding: 8px 10px;
      font-size: 11px;
    }

    .bottom {
      padding: 12px 16px max(18px, env(safe-area-inset-bottom));
    }

    .chips-wrap {
      width: calc(100% - 24px);
      margin-bottom: 4px;
    }

    .chips {
      gap: 6px;
    }

    .chip {
      padding: 7px 10px;
    }

    .counter {
      font-size: 10px;
    }
  }

  @media (max-width: 850px) {
    .swipe-deck {
      flex: 1 1 auto;
    }

    .deck-viewport {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .progress,
    .slide {
      transition-duration: 0.01ms;
    }
  }

  .brand,
  .top-actions,
  .chips-wrap,
  .bottom {
    transition: opacity 200ms ease !important;
  }

  .deck-viewport {
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
  }

  .swipe-deck.is-reading .brand,
  .swipe-deck.is-reading .top-actions,
  .swipe-deck.is-reading .chips-wrap,
  .swipe-deck.is-reading .bottom {
    opacity: 0;
    pointer-events: none;
  }

  .swipe-deck.is-reading .deck-viewport {
    opacity: 0;
    pointer-events: none;
    transform: translateY(-16px);
  }

  .reader {
    position: absolute;
    top: 72px;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    transform: translateY(16px);
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
    container-type: inline-size;
  }

  .reader.shown {
    opacity: 1;
    transform: translateY(0);
  }

  .close-read {
    position: absolute;
    right: 22px;
    bottom: max(22px, calc(env(safe-area-inset-bottom) + 12px));
    z-index: 5;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--color-text-muted);
    border-radius: 50%;
    background: transparent;
    color: var(--color-text);
    opacity: 0;
    transform: translateY(16px);
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
  }

  .close-read.shown {
    opacity: 1;
    transform: translateY(0);
  }

  .close-read svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 1.5;
    fill: none;
    stroke-linecap: round;
  }

  .reader-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding-bottom: 28px;
  }

  .reader-column {
    width: min(42rem, calc(100cqi - 48px));
    margin-right: 0;
    margin-left: max(24px, calc((100cqi - min(42rem, 100cqi - 48px)) / 2));
  }

  .reader-scroll .reader-column {
    padding-bottom: 64px;
  }

  .next-read {
    padding: 8px 0;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font-size: 1.15rem;
    font-weight: 650;
  }

  .next-read:disabled {
    opacity: 0.4;
  }

  .reader .reader-kicker {
    margin: 6px 0 8px;
    color: var(--color-eyebrow);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    line-height: 1.4;
    text-transform: uppercase;
  }

  .reader-mark {
    margin-bottom: 14px;
    color: var(--color-ornament);
    font-family: var(--font-editorial);
    font-size: 2.6rem;
    line-height: 1;
  }

  .reader h2 {
    margin: 0 0 1.6rem;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(2.5rem, 6vw, 4rem);
    font-weight: 400;
    letter-spacing: -0.03em;
    line-height: 1.28;
  }

  .reader h3 {
    margin: 2rem 0 0.8rem;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(1.8rem, 3.4vw, 2.35rem);
    font-weight: 400;
    line-height: 1.35;
  }

  .reader p,
  .reader blockquote {
    margin: 0 0 1.6em;
    color: var(--color-text);
    font-size: clamp(1.65rem, 2.8vw, 2.05rem);
    line-height: 1.7;
  }

  .reader-line {
    display: block;
    margin: 0 0 0.75em;
  }

  .reader-line:last-child {
    margin-bottom: 0;
  }

  .reader blockquote {
    padding-left: 0.15rem;
    color: var(--color-text-secondary);
    font-family: var(--font-editorial);
  }

  .reader-ornament {
    margin-right: 0.4rem;
    color: var(--color-ornament);
  }

  .reader-wait,
  .reader-end {
    color: var(--color-text-muted);
    font-size: clamp(1.35rem, 2.4vw, 1.6rem);
  }

  .reader-end {
    margin-top: 2rem;
  }

  @media (max-width: 640px) {
    .reader {
      top: 58px;
    }

    .close-read {
      right: 14px;
      bottom: max(16px, calc(env(safe-area-inset-bottom) + 10px));
    }

    .reader-scroll {
      padding-bottom: 24px;
    }

    .reader-column {
      width: min(42rem, calc(100cqi - 40px));
      margin-left: max(20px, calc((100cqi - min(42rem, 100cqi - 40px)) / 2));
    }
  }
</style>
