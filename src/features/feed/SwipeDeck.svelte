
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
  import { isTopicFilter } from "../content/filter-contents";
  import ThemeToggle from "../theme/ThemeToggle.svelte";
  import {
    invalidateMine,
    prefetchMine,
    type MineItem,
    type MineKind,
    type MineOpenable,
    type MinePost
  } from "../mine/mine-client";
  import { fetchMe, type AccountUser } from "../account/account-client";
  import {
    readBlocks,
    splitSentences,
    type ArticleBlock
  } from "./read-blocks";

  let {
    initialItems = [],
    initialCursor = null,
    initialMatched = true,
    initialUser,
    initialPostNews = 0
  }: {
    initialItems?: ContentItem[];
    initialCursor?: string | null;
    initialMatched?: boolean;
    initialUser?: AccountUser | null;
    initialPostNews?: number;
  } = $props();

  let selectedTopic = $state<TopicFilter>("all");
  let selectedMood = $state<MoodFilter>("all");
  type SectionKey = "for-you" | "loved" | Exclude<TopicFilter, "all">;

  const sections: Array<{ key: SectionKey; label: string }> = [
    { key: "for-you", label: "Dành cho bạn" },
    { key: "loved", label: "Yêu thích nhất" },
    { key: "peace", label: "Bình yên" },
    { key: "stories", label: "Câu chuyện" },
    { key: "science", label: "Khoa học" },
    { key: "nature", label: "Thiên nhiên" },
    { key: "perspective", label: "Góc nhìn" },
    { key: "psychology", label: "Tâm lý" },
    { key: "cute", label: "Dễ thương" },
    { key: "tips", label: "Mẹo thú vị" }
  ];

  let selectedSection = $state<SectionKey>("for-you");
  let lovedMode = $state(false);
  let sectionBar = $state<HTMLElement | null>(null);

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

  // Thich / luu / chia se. Cookie an danh chi tao o lan bam dau tien.
  type Reaction = {
    liked: boolean;
    saved: boolean;
    likeCount: number;
    saveCount: number;
    shareCount: number;
  };

  const SHARED_FLASH_MS = 1400;
  const EMPTY_REACTION: Reaction = {
    liked: false,
    saved: false,
    likeCount: 0,
    saveCount: 0,
    shareCount: 0
  };
  const countFormat = new Intl.NumberFormat("vi-VN", {
    notation: "compact",
    maximumFractionDigits: 1
  });

  let reactions = $state<Record<string, Reaction>>({});
  let sharedId = $state<string | null>(null);
  let shareTimer = 0;
  let writeSerial = 0;
  const lastWrite: Record<string, number> = {};
  const reactionLoads = new Set<string>();
  let reactionEpoch = 0;
  // Ghi tuan tu de lan bam dau khong tao hai ma an danh.
  let writeQueue: Promise<unknown> = Promise.resolve();

  // Bai mo tu "Cua toi" khong nam trong bo the.
  type ReadItem = Pick<
    ContentItem,
    "id" | "title" | "category" | "description" | "theme"
  >;

  let readItem = $state<ReadItem | null>(null);
  let readFromMine = $state(false);
  let activeItem = $derived<ReadItem | null>(
    reading && readItem ? readItem : (contents[currentIndex] ?? null)
  );

  // Chua tai xong thi khong hien so, tranh nhay tu 0.
  let activeReaction = $derived<Reaction | null>(
    reactions[activeItem?.id ?? ""] ?? null
  );

  function formatCount(value: number | undefined): string {
    return value === undefined ? "" : countFormat.format(value);
  }

  function readReaction(value: unknown): Reaction | null {
    if (!value || typeof value !== "object") return null;

    const { liked, saved, likeCount, saveCount, shareCount } =
      value as Record<string, unknown>;

    return typeof liked === "boolean" &&
      typeof saved === "boolean" &&
      typeof likeCount === "number" &&
      typeof saveCount === "number" &&
      typeof shareCount === "number"
      ? { liked, saved, likeCount, saveCount, shareCount }
      : null;
  }

  function sendInteraction(
    id: string,
    path: "reactions" | "shares",
    body: Record<string, unknown>
  ): Promise<Reaction | null> {
    const run = async () => {
      const response = await fetch(
        `/api/contents/${encodeURIComponent(id)}/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) return null;

      return readReaction(await response.json());
    };

    const result = writeQueue.then(run).catch(() => null);
    writeQueue = result;
    return result;
  }

  function toggleReaction(kind: "like" | "save") {
    const item = activeItem;
    if (!item) return;

    const before = reactions[item.id];
    const on = kind === "like" ? !before?.liked : !before?.saved;
    void setReaction(item.id, kind, on);
  }

  // Danh sach "Cua toi" biet chac trang thai cu khi chua tai so dem.
  async function setReaction(
    id: string,
    kind: "like" | "save",
    on: boolean
  ) {
    const before =
      reactions[id] ??
      (kind === "like"
        ? { ...EMPTY_REACTION, liked: !on }
        : { ...EMPTY_REACTION, saved: !on });
    const set = (value: boolean): Reaction => {
      const now = reactions[id] ?? before;
      const step = value ? 1 : -1;

      return kind === "like"
        ? now.liked === value
          ? now
          : {
              ...now,
              liked: value,
              likeCount: Math.max(0, now.likeCount + step)
            }
        : now.saved === value
          ? now
          : {
              ...now,
              saved: value,
              saveCount: Math.max(0, now.saveCount + step)
            };
    };

    reactions[id] = set(on);

    const serial = ++writeSerial;
    lastWrite[id] = serial;

    const state = await sendInteraction(id, "reactions", { kind, on });
    if (state) invalidateMine();
    if (lastWrite[id] !== serial) return;

    reactions[id] = state ?? set(!on);
  }

  async function shareCurrent() {
    const item = activeItem;
    if (!item) return;

    const url = `${window.location.origin}/`;
    let channel: "native" | "copy_link";

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: item.title, url });
        channel = "native";
      } else {
        await navigator.clipboard.writeText(`${item.title}\n${url}`);
        channel = "copy_link";
      }
    } catch {
      // Nguoi dung huy hoac trinh duyet chan: khong tinh luot.
      return;
    }

    sharedId = item.id;
    window.clearTimeout(shareTimer);
    shareTimer = window.setTimeout(() => {
      sharedId = null;
    }, SHARED_FLASH_MS);

    const id = item.id;
    const now = reactions[id];
    if (now) reactions[id] = { ...now, shareCount: now.shareCount + 1 };

    const serial = ++writeSerial;
    lastWrite[id] = serial;

    const state = await sendInteraction(id, "shares", { channel });
    if (state && lastWrite[id] === serial) reactions[id] = state;
  }

  // "Cua toi": tai code va trang dau khi vua cham nut, truoc khi ngan mo.
  type MineSheetComponent =
    typeof import("../mine/MineSheet.svelte").default;

  type AccountSheetComponent =
    typeof import("../account/AccountSheet.svelte").default;

  type WriteSheetComponent =
    typeof import("../write/WriteSheet.svelte").default;

  let MineSheet = $state<MineSheetComponent | null>(null);
  let AccountSheet = $state<AccountSheetComponent | null>(null);
  let WriteSheet = $state<WriteSheetComponent | null>(null);
  let mineOpen = $state(false);
  let accountOpen = $state(false);
  let writeOpen = $state(false);
  let mineTab = $state<"post" | null>(null);
  let writeEdit = $state<{ id: string; serial: number } | null>(null);
  let editSerial = 0;
  let postsVersion = $state(0);
  let mineCode: Promise<void> | null = null;
  let accountCode: Promise<void> | null = null;
  let writeCode: Promise<void> | null = null;
  const writeTopics = sections.filter(
    (section) => section.key !== "for-you" && section.key !== "loved"
  );
  let user = $state<AccountUser | null>(initialUser ?? null);
  let userKnown = $state(initialUser !== undefined);
  // So bai vua duoc duyet / tu choi ma nguoi viet chua mo "Da viet".
  let postNews = $state(initialPostNews);
  let meLoad: Promise<void> | null = null;
  let sheetOpen = $derived(mineOpen || accountOpen || writeOpen);
  let userInitial = $derived(
    (user?.displayName.trim().charAt(0) || "·").toLocaleUpperCase("vi")
  );

  function ensureMe() {
    if (userKnown) return;
    meLoad ??= fetchMe()
      .then((value) => {
        user = value.user;
        postNews = value.postNews;
        userKnown = true;
      })
      .catch(() => {
        meLoad = null;
      });
  }

  function warmMine() {
    ensureMe();
    void prefetchMine("like");
    mineCode ??= import("../mine/MineSheet.svelte")
      .then((module) => {
        MineSheet = module.default;
      })
      .catch(() => {
        mineCode = null;
      });
  }

  function warmAccount() {
    ensureMe();
    accountCode ??= import("../account/AccountSheet.svelte")
      .then((module) => {
        AccountSheet = module.default;
      })
      .catch(() => {
        accountCode = null;
      });
  }

  function warmWrite() {
    ensureMe();
    writeCode ??= import("../write/WriteSheet.svelte")
      .then((module) => {
        WriteSheet = module.default;
      })
      .catch(() => {
        writeCode = null;
      });
  }

  // Moi ngan chiem mot muc lich su de nut Back dong ngan.
  function showSheet(which: "mine" | "account" | "write") {
    const replace = sheetOpen;
    mineOpen = which === "mine";
    accountOpen = which === "account";
    writeOpen = which === "write";

    if (replace && history.state?.binhyenSheet) {
      history.replaceState({ binhyenSheet: true }, "");
    } else {
      history.pushState({ binhyenSheet: true }, "");
    }
  }

  async function showMine(tab: "post" | null) {
    if (mineOpen || reading) return;

    mineTab = tab;
    warmMine();
    await mineCode;
    if (!MineSheet || mineOpen) return;

    showSheet("mine");
  }

  function openMine() {
    void showMine(postNews > 0 ? "post" : null);
  }

  function openMinePosts() {
    void showMine("post");
  }

  async function openAccount() {
    if (accountOpen || reading) return;

    warmAccount();
    await accountCode;
    if (!AccountSheet || accountOpen) return;

    showSheet("account");
  }

  async function showWrite(edit: { id: string; serial: number } | null) {
    if (writeOpen || reading) return;

    warmWrite();
    await writeCode;
    if (!WriteSheet || writeOpen) return;

    writeEdit = edit;
    showSheet("write");
  }

  function openWrite() {
    void showWrite(null);
  }

  function editPost(item: MinePost) {
    editSerial += 1;
    void showWrite({ id: item.id, serial: editSerial });
  }

  function closeSheet() {
    if (!sheetOpen) return;

    if (history.state?.binhyenSheet) {
      history.back();
    } else {
      mineOpen = false;
      accountOpen = false;
      writeOpen = false;
    }
  }

  // Doi nguoi dung thi trang thai thich / luu cu khong con dung.
  function resetReactions() {
    reactionEpoch += 1;
    reactions = {};
    for (const id of Object.keys(lastWrite)) delete lastWrite[id];
    reactionLoads.clear();
    invalidateMine();
  }

  function onSignedIn(next: AccountUser) {
    user = next;
    userKnown = true;
    postNews = 0;
    resetReactions();
    refreshForYou();
    void fetchMe()
      .then((value) => {
        if (value.user?.id === user?.id) postNews = value.postNews;
      })
      .catch(() => {});
  }

  function onSignedOut() {
    user = null;
    userKnown = true;
    postNews = 0;
    resetReactions();
    refreshForYou();
  }

  function onProfileSaved(next: AccountUser, topicsChanged: boolean) {
    user = next;
    if (topicsChanged) refreshForYou();
  }

  function openMineItem(item: MineOpenable) {
    openReading(item, true);
  }

  function setMineReaction(item: MineItem, kind: MineKind, on: boolean) {
    void setReaction(item.id, kind, on);
  }

  // Doi the dung yen mot chut moi tai, luot nhanh khong goi API.
  $effect(() => {
    const id = activeItem?.id;

    if (!id || reactions[id] || reactionLoads.has(id)) {
      return;
    }

    const timer = window.setTimeout(() => {
      const epoch = reactionEpoch;
      reactionLoads.add(id);

      fetch(`/api/contents/${encodeURIComponent(id)}/reactions`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: unknown) => {
          if (epoch !== reactionEpoch) return;
          const state = readReaction(body);
          if (state && !(id in lastWrite)) reactions[id] = state;
        })
        .catch(() => undefined)
        .finally(() => {
          if (epoch === reactionEpoch) reactionLoads.delete(id);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  });

  // STEP11_SESSION_HISTORY
  const seenIds = new Set<string>();
  let seenCount = $state(0);
  let pageVisible = $state(true);
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
  let emptyCopy = $derived(
    loadError
      ? {
          title: "Không tải được nội dung",
          text: loadError,
          label: "Thử tải lại",
          action: retryLoad
        }
      : lovedMode
        ? {
            title: "Chưa có bài nào được yêu thích",
            text: "Chạm ♡ ở một bài để bài ấy xuất hiện ở đây.",
            label: "Xem Dành cho bạn",
            action: showAll
          }
        : filtered && !directMatch
          ? {
              title: "Chưa có nội dung cho lựa chọn này",
              text: "Hãy thử một chủ đề khác.",
              label: "Xem tất cả",
              action: showAll
            }
          : {
              title: "Chưa có nội dung",
              text: "Những điều đẹp đẽ sẽ xuất hiện khi có bài mới.",
              label: "Thử lại",
              action: restartSession
            }
  );

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
        replaceOnLoad = false;

        if (topicFading) {
          swapAfterFade(page.items);
        } else {
          contents = page.items;
          currentIndex = 0;
          setOffset(0);
        }
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
      endTopicFade();
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
    mood: MoodFilter,
    loved = false
  ) {
    if (dragging || animating) return;

    const newSource = createApiFeedSource(
      topic,
      mood,
      loved ? { section: "loved" } : {}
    );
    lovedMode = loved;

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
    if (contents.length > 0) startTopicFade();
    void loadMore();
  }

  function centerSection(key: SectionKey) {
    const button = sectionBar?.querySelector<HTMLElement>(
      `[data-section="${key}"]`
    );
    if (!sectionBar || !button) return;

    sectionBar.scrollTo({
      left:
        button.offsetLeft -
        (sectionBar.clientWidth - button.offsetWidth) / 2,
      behavior: "smooth"
    });
  }

  function showAll() {
    selectedSection = "for-you";
    centerSection("for-you");
    applyFilters("all", "all");
  }

  function chooseSection(key: SectionKey) {
    if (
      key === selectedSection ||
      dragging ||
      animating ||
      replaceOnLoad
    ) {
      return;
    }

    selectedSection = key;
    centerSection(key);
    applyFilters(
      isTopicFilter(key) ? key : "all",
      "all",
      key === "loved"
    );
  }

  function sectionScroll(node: HTMLElement) {
    let pointerId = -1;
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    function onWheel(event: WheelEvent) {
      if (
        Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
        node.scrollWidth <= node.clientWidth
      ) {
        return;
      }

      event.preventDefault();
      node.scrollLeft += event.deltaY;
    }

    // Trình duyệt không cuộn khung tràn khi kéo bằng chuột, chỉ khi vuốt tay.
    function onPointerDown(event: PointerEvent) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;

      pointerId = event.pointerId;
      startX = event.clientX;
      startScroll = node.scrollLeft;
      moved = false;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;

      const distance = event.clientX - startX;

      if (!moved) {
        if (Math.abs(distance) < 6) return;
        moved = true;
        node.setPointerCapture(pointerId);
        node.classList.add("dragging");
      }

      node.scrollLeft = startScroll - distance;
    }

    function onPointerEnd(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;

      pointerId = -1;
      node.classList.remove("dragging");
      if (node.hasPointerCapture(event.pointerId)) {
        node.releasePointerCapture(event.pointerId);
      }
    }

    function onClick(event: MouseEvent) {
      if (!moved) return;

      moved = false;
      event.preventDefault();
      event.stopPropagation();
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", onPointerEnd);
    node.addEventListener("pointercancel", onPointerEnd);
    node.addEventListener("click", onClick, true);

    return {
      destroy() {
        node.removeEventListener("wheel", onWheel);
        node.removeEventListener("pointerdown", onPointerDown);
        node.removeEventListener("pointermove", onPointerMove);
        node.removeEventListener("pointerup", onPointerEnd);
        node.removeEventListener("pointercancel", onPointerEnd);
        node.removeEventListener("click", onClick, true);
      }
    };
  }

  let lastWheel = 0;
  let readingOut = $state(false);
  let fadeSwap = $state(false);
  let readingTimer = 0;
  let fadeSerial = 0;

  const READING_MS = 200;
  const WHEEL_COOLDOWN_MS = 580;

  let topicFading = false;
  let fadeOutUntil = 0;
  let pendingItems: ContentItem[] | null = null;

  function cancelFade() {
    fadeSerial += 1;
    window.clearTimeout(readingTimer);
    readingTimer = 0;
    readingOut = false;
    fadeSwap = false;
    topicFading = false;

    if (pendingItems) {
      contents = pendingItems;
      currentIndex = 0;
      pendingItems = null;
      setOffset(0);
    }
  }

  function startTopicFade() {
    fadeSerial += 1;
    window.clearTimeout(readingTimer);
    animating = true;
    topicFading = true;
    fadeSwap = true;
    readingOut = true;
    fadeOutUntil = performance.now() + READING_MS;
  }

  function endTopicFade() {
    if (!topicFading) return;

    cancelFade();
    animating = false;
  }

  // Bài cũ mờ hết rồi mới thay, bài mới hiện lên như khi lăn chuột.
  function swapAfterFade(items: ContentItem[]) {
    const serial = fadeSerial;
    pendingItems = items;

    readingTimer = window.setTimeout(() => {
      if (serial !== fadeSerial) return;

      contents = items;
      currentIndex = 0;
      pendingItems = null;
      setOffset(0);

      readingTimer = window.setTimeout(() => {
        if (serial !== fadeSerial) return;

        readingOut = false;
        readingTimer = window.setTimeout(() => {
          if (serial !== fadeSerial) return;

          fadeSwap = false;
          topicFading = false;
          animating = false;
        }, READING_MS);
      }, 32);
    }, Math.max(0, fadeOutUntil - performance.now()));
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

  function openReading(target?: ReadItem, fromMine = false) {
    const item = target ?? contents[currentIndex];
    if (!item || reading) return;
    if (!fromMine && (animating || dragging || replaceOnLoad)) return;

    window.clearTimeout(closeTimer);
    const serial = ++readSerial;
    readItem = item;
    readFromMine = fromMine;
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
      readItem = null;
      readFromMine = false;
      articleBlocks = [];
      articleReady = false;
      articleError = "";
      readProgress = 0;
    }, 200);
  }

  function readNext() {
    if (!canNext || animating || readFromMine) return;

    const nextIndex = currentIndex + 1;
    readerShown = false;
    readSerial += 1;
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      setOffset(0);
      currentIndex = nextIndex;
      reading = false;
      readItem = null;
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

  // Chu de yeu thich doi thi "Danh cho ban" xep lai tu dau.
  function refreshForYou() {
    if (
      selectedSection !== "for-you" ||
      selectedTopic !== "all" ||
      selectedMood !== "all" ||
      lovedMode
    ) {
      return;
    }

    applyFilters("all", "all");
  }

  // Xem lai tu dau, giu chu de va tam trang dang chon.
  function restartSession() {
    if (dragging || animating) return;

    seenIds.clear();
    seenCount = 0;

    applyFilters(selectedTopic, selectedMood, lovedMode);
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
      if (event.key !== "Escape" || (!reading && !sheetOpen)) return;

      event.preventDefault();
      if (reading) closeReading();
      else closeSheet();
    }

    function handlePopState() {
      mineOpen = false;
      accountOpen = false;
      writeOpen = false;
    }

    if (history.state?.binhyenSheet) history.replaceState(null, "");
    // May chu khong doc duoc nguoi dung thi hoi lai, sau khi the dau da hien.
    const meTimer = userKnown ? 0 : window.setTimeout(ensureMe, 1200);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("popstate", handlePopState);
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
      window.clearTimeout(meTimer);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("popstate", handlePopState);
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
      cancelFade();
      window.clearTimeout(closeTimer);
    };
  });
</script>

<div class="swipe-deck" class:is-reading={reading}>
  <header class="topbar" inert={reading || sheetOpen}>
    <nav
      class="sections"
      aria-label="Mục nội dung"
      bind:this={sectionBar}
      use:sectionScroll
    >
      {#each sections as section (section.key)}
        <button
          type="button"
          class="section"
          class:active={section.key === selectedSection}
          aria-pressed={section.key === selectedSection}
          data-section={section.key}
          onclick={() => chooseSection(section.key)}
        >
          {section.label}
        </button>
      {/each}
    </nav>
    <ThemeToggle />
  </header>
  <div
    class="deck-viewport"
    class:dragging={dragging}
    class:fade-swap={fadeSwap}
    inert={reading || sheetOpen}
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

        <h3>{emptyCopy.title}</h3>
        <p>{emptyCopy.text}</p>
        <button type="button" onclick={emptyCopy.action}>
          {emptyCopy.label}
        </button>
      </div>
    {/if}
  </div>

  <footer class="bottom" inert={reading || sheetOpen}>
    <nav class="dock" aria-label="Điều hướng chính">
      <button
        type="button"
        class="dock-item"
        aria-haspopup="dialog"
        aria-expanded={mineOpen}
        aria-label={postNews > 0 ? "Của tôi, có kết quả duyệt bài mới" : undefined}
        onpointerdown={warmMine}
        onclick={openMine}
      >
        <span class="dock-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="7" width="16" height="13" rx="2.5" />
            <path d="M7 4h10M9 11.5h6" />
          </svg>
          {#if postNews > 0}
            <span class="dock-dot" aria-hidden="true"></span>
          {/if}
        </span>
        <span>Của tôi</span>
      </button>
      <button
        type="button"
        class="dock-write"
        aria-label="Viết nội dung"
        aria-haspopup="dialog"
        aria-expanded={writeOpen}
        onpointerdown={warmWrite}
        onclick={openWrite}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button type="button" class="dock-item">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="6" r="2" />
          <path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16" />
        </svg>
        <span>Hành trình</span>
      </button>
      <button
        type="button"
        class="dock-item dock-account"
        aria-label={user ? `Tài khoản: ${user.displayName}` : "Tài khoản"}
        aria-haspopup="dialog"
        aria-expanded={accountOpen}
        onpointerdown={warmAccount}
        onclick={openAccount}
      >
        {#if user}
          <span class="dock-avatar" aria-hidden="true">{userInitial}</span>
        {:else}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M5 19.5c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" />
          </svg>
        {/if}
        <span>Tài khoản</span>
      </button>
    </nav>
  </footer>

  {#if activeItem}
    <div class="read-rail" inert={sheetOpen && !reading}>
      <div class="rail-item">
        <button
          type="button"
          class="read-icon"
          class:active={activeReaction?.liked}
          aria-label="Yêu thích"
          aria-pressed={activeReaction?.liked ?? false}
          onclick={() => toggleReaction("like")}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 13.2S2.6 10 2.6 6.1A2.7 2.7 0 0 1 8 4.9a2.7 2.7 0 0 1 5.4 1.2C13.4 10 8 13.2 8 13.2Z" />
          </svg>
        </button>
        <span class="rail-count">
          {formatCount(activeReaction?.likeCount)}
        </span>
      </div>
      <div class="rail-item">
        <button
          type="button"
          class="read-icon"
          class:active={activeReaction?.saved}
          aria-label="Lưu"
          aria-pressed={activeReaction?.saved ?? false}
          onclick={() => toggleReaction("save")}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.3 2.8h7.4v10.6L8 10.9l-3.7 2.5Z" />
          </svg>
        </button>
        <span class="rail-count">
          {formatCount(activeReaction?.saveCount)}
        </span>
      </div>
      <div class="rail-item">
        <button
          type="button"
          class="read-icon read-share"
          class:active={sharedId === activeItem.id}
          aria-label={sharedId === activeItem.id
            ? "Đã chia sẻ"
            : "Chia sẻ"}
          onclick={shareCurrent}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 10V2.6M5.2 5.2 8 2.4l2.8 2.8M3.4 8.6v4.6h9.2V8.6" />
          </svg>
        </button>
        <span class="rail-count">
          {formatCount(activeReaction?.shareCount)}
        </span>
      </div>
    </div>
  {/if}

  {#if reading && readItem}
    {@const item = readItem}
    <div class="read-actions" class:shown={readerShown}>
      <button
        type="button"
        class="read-icon"
        onclick={closeReading}
        aria-label="Khép lại"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />
        </svg>
      </button>
      <button
        type="button"
        class="read-icon"
        onclick={readNext}
        disabled={!canNext || readFromMine}
        aria-label="Bài kế"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9M8.8 4.3 12.5 8l-3.7 3.7" />
        </svg>
      </button>
    </div>
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

  {#if MineSheet}
    <MineSheet
      open={mineOpen}
      {reading}
      signedIn={user !== null}
      {postsVersion}
      {postNews}
      onPostsSeen={() => (postNews = 0)}
      startTab={mineTab}
      {reactions}
      onClose={closeSheet}
      onOpenItem={openMineItem}
      onSetReaction={setMineReaction}
      onEditPost={editPost}
    />
  {/if}

  {#if WriteSheet}
    <WriteSheet
      open={writeOpen}
      userId={user?.id ?? null}
      {userKnown}
      topics={writeTopics}
      edit={writeEdit}
      onClose={closeSheet}
      onSignIn={openAccount}
      onSaved={() => (postsVersion += 1)}
      onOpenPosts={openMinePosts}
    />
  {/if}

  {#if AccountSheet}
    <AccountSheet
      open={accountOpen}
      {user}
      {userKnown}
      onClose={closeSheet}
      {onSignedIn}
      {onSignedOut}
      onOpenMine={openMine}
      {onProfileSaved}
    />
  {/if}
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
    gap: 12px;
    flex: 0 0 auto;
    min-width: 0;
    padding: 20px 30px 0 18px;
  }

  .sections {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    user-select: none;
    -webkit-user-select: none;
    mask-image: linear-gradient(
      90deg,
      transparent 0,
      #000 8px,
      #000 calc(100% - 22px),
      transparent 100%
    );
  }

  .sections::-webkit-scrollbar {
    display: none;
  }

  .sections:global(.dragging) {
    cursor: grabbing;
  }

  .section,
  .dock button {
    font: inherit;
  }

  .section {
    flex: none;
    padding: 10px 12px;
    border: 0;
    background: transparent;
    color: var(--color-quiet);
    font-size: 13px;
    white-space: nowrap;
    text-decoration: underline 1px transparent;
    text-underline-offset: 8px;
  }

  .section.active {
    color: var(--color-text);
    font-weight: 650;
    text-decoration-color: currentColor;
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

  .bottom {
    position: relative;
    z-index: 2;
    flex: 0 0 auto;
    padding: 10px 30px 22px;
  }

  .dock {
    display: grid;
    grid-template-columns: 1fr 84px 64px 84px 1fr;
    align-items: center;
    justify-items: center;
  }

  .dock .dock-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
    border: 0;
    background: transparent;
    color: var(--color-quiet);
    font-size: 10px;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .dock-item:nth-child(1) {
    grid-column: 2;
  }

  .dock-icon {
    position: relative;
    display: grid;
  }

  .dock-dot {
    position: absolute;
    top: -2px;
    right: -4px;
    width: 8px;
    height: 8px;
    border: 1.5px solid var(--color-surface);
    border-radius: 50%;
    background: var(--color-primary);
  }

  .dock-write {
    grid-column: 3;
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-surface);
    box-shadow: 0 8px 22px color-mix(in srgb, var(--color-primary) 32%, transparent);
  }

  .dock-item:nth-child(3) {
    grid-column: 4;
  }

  .dock-account {
    grid-column: 5;
    justify-self: end;
  }

  .dock-account .dock-avatar {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 12px;
    line-height: 1;
    letter-spacing: 0;
  }

  .dock svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dock-write svg {
    width: 26px;
    height: 26px;
    stroke-width: 2;
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
      gap: 6px;
      padding: 14px 14px 0 4px;
    }

    .section {
      padding: 10px 10px;
      font-size: 12px;
    }

    .bottom {
      padding: 8px 14px max(14px, env(safe-area-inset-bottom));
    }

    .dock {
      grid-template-columns: 1fr 72px 58px 72px 1fr;
    }

    .dock-write {
      width: 50px;
      height: 50px;
    }
  }

  @media (max-width: 360px) {
    .dock-account span {
      display: none;
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

  .topbar,
  .bottom {
    transition: opacity 200ms ease !important;
  }

  .deck-viewport {
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
  }

  .swipe-deck.is-reading .topbar,
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

  .read-actions {
    position: absolute;
    right: 22px;
    bottom: max(22px, calc(env(safe-area-inset-bottom) + 12px));
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 8px;
    opacity: 0;
    transform: translateY(16px);
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
  }

  .read-actions.shown {
    opacity: 1;
    transform: translateY(0);
  }

  .read-rail {
    position: absolute;
    top: 50%;
    right: 22px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transform: translateY(-50%);
  }

  .rail-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .rail-count {
    min-height: 13px;
    color: var(--color-text-muted);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 13px;
  }

  .read-icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--color-text-muted);
    border-radius: 50%;
    background: transparent;
    color: var(--color-text);
  }

  .read-icon:disabled {
    opacity: 0.35;
  }

  .read-icon.active {
    border-color: var(--color-text);
  }

  .read-icon.active:not(.read-share) svg {
    fill: currentColor;
  }

  .read-icon svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 1.5;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .reader-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding-bottom: 28px;
  }

  .reader-column {
    width: min(42rem, calc(100cqi - 108px));
    margin-right: 0;
    margin-left: max(24px, calc((100cqi - min(42rem, 100cqi - 108px)) / 2));
  }

  .reader-scroll .reader-column {
    padding-bottom: 64px;
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

    .read-actions {
      right: 14px;
      bottom: max(16px, calc(env(safe-area-inset-bottom) + 10px));
    }

    .reader-scroll {
      padding-bottom: 24px;
    }

    .read-rail {
      right: 14px;
    }

    .reader-column {
      width: calc(100cqi - 74px);
      margin-left: 20px;
    }
  }
</style>
