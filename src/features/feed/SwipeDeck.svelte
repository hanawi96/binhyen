
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import ContentCard from "./ContentCard.svelte";
  import { demoContents } from "../content/demo-contents";
  import { type ContentItem } from "../content/content.types";
  import {
    atmosphereStyle,
    buildAtmosphereMap,
    getAtmospherePreset,
    pickAtmosphereId,
    type AtmosphereMode
  } from "./atmosphere-presets";
  import { readTheme } from "../theme/theme";
  import {
    createApiFeedSource,
    createCollectionFeedSource,
    FeedLoadError,
    isFeedAbort
  } from "./api-feed-source";
  import type {
    TopicFilter,
    MoodFilter
  } from "../content/filter-contents";
  import { isTopicFilter } from "../content/filter-contents";
  import AmbientPanel from "../ambient/AmbientPanel.svelte";
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
  import {
    browserStorage,
    pushRecentSeen,
    readRecentSeen,
    writeRecentSeen
  } from "./recent-seen";
  import { createSeenReporter } from "./report-seen";

  let {
    initialItems = [],
    initialCursor = null,
    initialPageCursor = null,
    initialMatched = true,
    initialNotice = null,
    initialUser,
    initialPostNews = 0,
    collection = null
  }: {
    initialItems?: ContentItem[];
    initialCursor?: string | null;
    initialPageCursor?: string | null;
    initialMatched?: boolean;
    initialNotice?: "all-seen" | null;
    initialUser?: AccountUser | null;
    initialPostNews?: number;
    collection?: {
      slug: string;
      title: string;
      description: string;
      coverUrl?: string;
      coverAlt?: string;
      itemCount: number;
    } | null;
  } = $props();

  const collectionMode = $derived(collection !== null);

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
  const ALL_SEEN_NOTE =
    "Bạn đã xem hết một vòng. Đang mở lại những bài cũ hơn.";
  const END_NOTE = "Bạn đã xem hết những điều đang có.";
  const COLLECTION_END_NOTE = "Bạn đã xem hết bộ này.";
  const RESTART_LABEL = "Xem lại từ đầu";
  const RETRY_LABEL = "Thử lại";
  const LOAD_ERROR_MESSAGES = [
    "Hết thời gian chờ. Hãy thử lại.",
    "Không có kết nối. Hãy thử lại.",
    "Không thể tải thêm nội dung."
  ];
  /** Trang rong (toan bai da xem) van con cursor: tu tai tiep, toi da vay lan. */
  const MAX_EMPTY_CONTINUES = 5;

  let source = collection
    ? createCollectionFeedSource(collection.slug)
    : createApiFeedSource("all", "all");

  const startingCursor =
    initialItems.length > 0 ? initialCursor : "__first__";

  let contents = $state<ContentItem[]>(initialItems);
  let nextCursor: string | null = startingCursor;
  let hasMore = $state(startingCursor !== null);
  let loading = $state(false);
  let loadError = $state("");
  let directMatch = $state(initialMatched);
  let feedNotice = $state<"all-seen" | null>(initialNotice);
  let loadSerial = 0;
  let loadController: AbortController | null = null;
  // Trang loc moi thay ca bo the, khong noi vao the cu.
  let replaceOnLoad = $state(false);

  /** pageCursor theo tung id de bao da xem dung vi tri. */
  const pageCursors = new Map<string, string | null>();
  const seenReporter = createSeenReporter();

  function rememberPageCursor(
    items: readonly ContentItem[],
    pageCursor: string | null
  ) {
    for (const item of items) pageCursors.set(item.id, pageCursor);
  }

  rememberPageCursor(initialItems, initialPageCursor);

  // Bo ket qua cu neu bo loc thay doi khi dang tai.
  let feedVersion = 0;

  const ANIMATION_MS = 400;
  const SWIPE_DISTANCE = 70;
  const READ_SWIPE_DISTANCE = 56;
  const AXIS_LOCK = 10;
  const MIN_FAST_DISTANCE = 30;
  const FAST_VELOCITY = 0.65;

  let deckElement: HTMLDivElement;

  let currentIndex = $state(0);
  let dragging = $state(false);
  let animating = $state(false);
  let reading = $state(false);
  let readerShown = $state(false);
  let readerDismissing = $state(false);
  let articleBlocks = $state<ArticleBlock[]>([]);
  /** Chi render body khi khop dung bai dang mo — tranh flash noi dung cu. */
  let articleForId = $state<string | null>(null);
  let articleReady = $state(false);
  let articleError = $state("");
  let readScroll = $state<HTMLElement | null>(null);
  let readSerial = 0;
  let closeTimer = 0;
  let readerShowTimer = 0;

  function clearArticleBody() {
    articleBlocks = [];
    articleForId = null;
    articleReady = false;
    articleError = "";
  }

  function fetchArticleFor(item: ReadItem, serial: number) {
    const openedId = item.id;
    void fetch(`/api/contents/${encodeURIComponent(openedId)}`)
      .then(async (response) => {
        if (serial !== readSerial || readItem?.id !== openedId) return;
        if (!response.ok) {
          clearArticleBody();
          articleError = "Không mở được bài.";
          return;
        }

        const body = articleBody(await response.json());

        if (serial !== readSerial || readItem?.id !== openedId) return;
        if (body === null) {
          clearArticleBody();
          articleError = "Không mở được bài.";
          return;
        }

        let blocks = readBlocks(body);

        if (
          blocks[0]?.kind === "heading" &&
          blocks[0].text === item.title
        ) {
          blocks = blocks.slice(1);
        }

        if (serial !== readSerial || readItem?.id !== openedId) return;

        articleBlocks = blocks;
        articleForId = openedId;
        articleReady = true;
        articleError = "";
      })
      .catch(() => {
        if (serial !== readSerial || readItem?.id !== openedId) return;
        clearArticleBody();
        articleError = "Không mở được bài.";
      });
  }

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

  /** So dem (va liked/saved neu co) di kem feed — hien rail dung ngay, khong flash 0. */
  function reactionFromItem(item: ContentItem): Reaction | null {
    if (typeof item.likeCount !== "number") return null;

    return {
      liked: item.liked === true,
      saved: item.saved === true,
      likeCount: item.likeCount,
      saveCount: typeof item.saveCount === "number" ? item.saveCount : 0,
      shareCount: typeof item.shareCount === "number" ? item.shareCount : 0
    };
  }

  function seedMap(items: readonly ContentItem[]): Record<string, Reaction> {
    const out: Record<string, Reaction> = {};

    for (const item of items) {
      const seed = reactionFromItem(item);
      if (seed) out[item.id] = seed;
    }

    return out;
  }

  let reactions = $state<Record<string, Reaction>>(seedMap(initialItems));
  /** Da co trang thai ca nhan tu feed hoac GET /reactions. */
  const personalReady = new Set(
    initialItems
      .filter((item) => typeof item.liked === "boolean")
      .map((item) => item.id)
  );
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

  /** Map id → preset 0..29; hai thẻ liền nhau khác màu. */
  const atmosphereMap = $derived(
    buildAtmosphereMap(contents.map((item) => item.id))
  );

  const atmosphereId = $derived.by(() => {
    const id = activeItem?.id;
    if (!id) return 0;
    return atmosphereMap.get(id) ?? pickAtmosphereId(id, -1);
  });

  let atmosphereMode = $state<AtmosphereMode>("light");
  /**
   * Chưa hydrate: không gắn inline --atm-* (dùng --atm-boot-* từ <head>).
   * Tránh SSR/hydrate mặc định light đè lên màu tối đúng của bài.
   */
  let atmosphereHydrated = $state(false);
  /** Bật morph sau khi đã gắn đúng màu — tránh animate từ màu sai. */
  let atmospherePaintReady = $state(false);
  const atmosphereCss = $derived(
    atmosphereHydrated
      ? atmosphereStyle(atmosphereId, atmosphereMode)
      : ""
  );

  /** Đồng bộ --atm-boot-* với thẻ đang xem (khớp AtmosphereBoot ở bài đầu). */
  $effect(() => {
    if (typeof document === "undefined" || !atmosphereHydrated) return;
    const preset = getAtmospherePreset(atmosphereId);
    const colors =
      atmosphereMode === "dark" ? preset.dark : preset.light;
    const root = document.documentElement;
    root.style.setProperty("--atm-boot-wash", colors.wash);
    root.style.setProperty("--atm-boot-a", colors.a);
    root.style.setProperty("--atm-boot-b", colors.b);
  });

  // So tren rail: giu so cu khi doi the / dang tai, roi truot sang so moi.
  type RailStats = {
    likeText: string;
    saveText: string;
    shareText: string;
    liked: boolean;
    saved: boolean;
  };

  const RAIL_MS = 400;
  /** Chi dung khi the chua co so dem trong feed. */
  const RAIL_PLACEHOLDER: RailStats = {
    likeText: "0",
    saveText: "0",
    shareText: "0",
    liked: false,
    saved: false
  };

  const firstSeed = initialItems[0]
    ? reactionFromItem(initialItems[0])
    : null;

  let railShown = $state<RailStats>(
    firstSeed
      ? {
          likeText: countFormat.format(firstSeed.likeCount),
          saveText: countFormat.format(firstSeed.saveCount),
          shareText: countFormat.format(firstSeed.shareCount),
          liked: firstSeed.liked,
          saved: firstSeed.saved
        }
      : { ...RAIL_PLACEHOLDER }
  );
  let railEnter = $state<RailStats | null>(null);
  let railDir = $state<1 | -1>(1);
  let railMoving = $state(false);
  let railTimer = 0;
  let railCardId: string | null = firstSeed && initialItems[0] ? initialItems[0].id : null;
  let railIndex = 0;
  let railPrimed = $state(firstSeed !== null);

  let railView = $derived(
    railMoving && railEnter ? railEnter : railShown
  );

  function statsFrom(reaction: Reaction): RailStats {
    return {
      likeText: countFormat.format(reaction.likeCount),
      saveText: countFormat.format(reaction.saveCount),
      shareText: countFormat.format(reaction.shareCount),
      liked: reaction.liked,
      saved: reaction.saved
    };
  }

  function sameRailText(left: RailStats, right: RailStats): boolean {
    return (
      left.likeText === right.likeText &&
      left.saveText === right.saveText &&
      left.shareText === right.shareText
    );
  }

  function reduceRailMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function commitRail(next: RailStats, dir: 1 | -1) {
    if (railTimer) {
      window.clearTimeout(railTimer);
      railTimer = 0;
    }

    const prev = untrack(() => railShown);
    const firstPaint = !untrack(() => railPrimed);

    // Lan dau co data: doi so tai cho (khong flash rong → so).
    if (
      firstPaint ||
      reduceRailMotion() ||
      sameRailText(prev, next)
    ) {
      railShown = next;
      railEnter = null;
      railMoving = false;
      railPrimed = true;
      return;
    }

    railDir = dir;
    railEnter = next;
    railMoving = true;
    railPrimed = true;
    railTimer = window.setTimeout(() => {
      railShown = next;
      railEnter = null;
      railMoving = false;
      railTimer = 0;
    }, RAIL_MS);
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
    personalReady.clear();
    for (const id of Object.keys(lastWrite)) delete lastWrite[id];
    reactionLoads.clear();
    if (railTimer) {
      window.clearTimeout(railTimer);
      railTimer = 0;
    }
    railShown = { ...RAIL_PLACEHOLDER };
    railEnter = null;
    railMoving = false;
    railCardId = null;
    railPrimed = false;
    invalidateMine();
  }

  function onSignedIn(next: AccountUser) {
    user = next;
    userKnown = true;
    postNews = 0;
    resetReactions();
    // Gui not lich su an danh truoc khi tai lai feed tai khoan.
    void seenReporter.flush().finally(() => {
      refreshForYou();
    });
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
    void seenReporter.flush().finally(() => {
      refreshForYou();
    });
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

  // Cap nhat so rail: doi the thi truot; chua co data thi giu so cu (khong an).
  $effect(() => {
    const item = activeItem;
    const index = currentIndex;
    if (!item) return;

    const reaction = reactions[item.id];
    if (!reaction) return;

    const next = statsFrom(reaction);
    const sameCard = railCardId === item.id;
    const dir: 1 | -1 = index >= railIndex ? 1 : -1;

    if (sameCard) {
      // Cung the (bam thich/luu): doi so ngay, khong truot.
      if (railTimer) {
        window.clearTimeout(railTimer);
        railTimer = 0;
      }
      railShown = next;
      railEnter = null;
      railMoving = false;
      return;
    }

    commitRail(next, dir);
    railCardId = item.id;
    railIndex = index;
  });

  // Gieo so dem tu trang feed moi (loadMore / doi muc).
  $effect(() => {
    for (const item of contents) {
      if (personalReady.has(item.id) || item.id in lastWrite) continue;

      const seed = reactionFromItem(item);
      if (!seed) continue;

      const existing = reactions[item.id];
      if (
        existing &&
        existing.likeCount === seed.likeCount &&
        existing.saveCount === seed.saveCount &&
        existing.shareCount === seed.shareCount
      ) {
        if (typeof item.liked === "boolean") personalReady.add(item.id);
        continue;
      }

      reactions[item.id] = existing
        ? {
            ...seed,
            liked: existing.liked,
            saved: existing.saved
          }
        : seed;

      if (typeof item.liked === "boolean") personalReady.add(item.id);
    }
  });

  // Chi GET /reactions khi feed chua mang liked/saved (vd. muc Yeu thich).
  $effect(() => {
    const id = activeItem?.id;

    if (!id || personalReady.has(id) || reactionLoads.has(id)) {
      return;
    }

    const switching = untrack(() => railCardId !== null && railCardId !== id);
    const delay = switching ? 250 : 0;

    const timer = window.setTimeout(() => {
      const epoch = reactionEpoch;
      reactionLoads.add(id);

      fetch(`/api/contents/${encodeURIComponent(id)}/reactions`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: unknown) => {
          if (epoch !== reactionEpoch) return;
          const state = readReaction(body);
          if (!state || id in lastWrite) return;
          reactions[id] = state;
          personalReady.add(id);
        })
        .catch(() => undefined)
        .finally(() => {
          if (epoch === reactionEpoch) reactionLoads.delete(id);
        });
    }, delay);

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
  let showingAllSeen = $derived(
    feedNotice === "all-seen" && contents.length > 0 && !loadError
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
      : collectionMode
        ? {
            title: COLLECTION_END_NOTE,
            text: "Quay lại danh sách để chọn bộ khác.",
            label: "Xem bộ sưu tập",
            action: () => {
              window.location.href = "/collections";
            }
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

      if (collectionMode) return;

      const storage = browserStorage();
      if (storage) {
        writeRecentSeen(storage, pushRecentSeen(readRecentSeen(storage), id));
      }

      seenReporter.mark(
        id,
        lovedMode ? null : (pageCursors.get(id) ?? null)
      );
    }, 900);

    return () => window.clearTimeout(timer);
  });

  // Pointer state
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let lastDistance = 0;
  let lastDistanceX = 0;
  /** none = chua khoa truc; y = doi the; x = mo doc bai */
  let dragAxis: "none" | "x" | "y" = "none";

  // Animation state
  let pendingIndex: number | null = null;
  let dragFrame = 0;
  let transitionFrame1 = 0;
  let transitionFrame2 = 0;
  let fallbackTimer = 0;
  let queuedOffset = 0;
  let queuedDragX = 0;
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

  function setDragX(value: number) {
    if (!deckElement) return;

    deckElement.style.setProperty("--drag-x", `${value}px`);
  }

  function cancelDragFrame() {
    if (dragFrame) {
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    }
  }

  function scheduleDragFrame() {
    if (dragFrame) return;

    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      setOffset(queuedOffset);
      setDragX(queuedDragX);
    });
  }

  function queueOffset(value: number) {
    queuedOffset = value;
    scheduleDragFrame();
  }

  function queueDragX(value: number) {
    queuedDragX = value;
    scheduleDragFrame();
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
    dragAxis = "none";
    queuedDragX = 0;
    setDragX(0);
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
    let emptyContinues = 0;

    try {
      while (serial === loadSerial && expectedVersion === feedVersion) {
        const activeCursor = nextCursor;

        if (activeCursor === null) break;

        const page = await activeSource.loadPage(
          activeCursor,
          PAGE_SIZE,
          controller.signal
        );

        // Ket qua cua bo loc cu khong duoc chen vao feed moi.
        if (serial !== loadSerial || expectedVersion !== feedVersion) {
          return;
        }

        rememberPageCursor(page.items, page.pageCursor ?? null);

        if (page.notice === "all-seen") feedNotice = "all-seen";

        const storage = browserStorage();
        const recent = new Set(storage ? readRecentSeen(storage) : []);
        let added = 0;

        if (replaceOnLoad) {
          replaceOnLoad = false;
          added = page.items.length;

          if (topicFading) {
            swapAfterFade(page.items);
          } else {
            contents = page.items;
            currentIndex = 0;
            setOffset(0);
          }
        } else {
          const loadedIds = new Set(contents.map((item) => item.id));
          const newItems = page.items.filter(
            (item) => !loadedIds.has(item.id) && !recent.has(item.id)
          );

          added = newItems.length;
          contents = [...contents, ...newItems];
        }

        if (activeCursor === "__first__") {
          directMatch = page.matched !== false;
        }

        nextCursor = page.nextCursor;
        hasMore = nextCursor !== null;

        // Trang khong them the moi nhung van con cursor: tai tiep.
        if (
          added > 0 ||
          nextCursor === null ||
          emptyContinues >= MAX_EMPTY_CONTINUES
        ) {
          break;
        }

        emptyContinues += 1;
      }
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

    void seenReporter.flush();

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
    pageCursors.clear();

    source = newSource;
    selectedTopic = topic;
    selectedMood = mood;

    nextCursor = firstPage.nextCursor;
    hasMore = nextCursor !== null;

    loading = false;
    loadError = "";
    directMatch = true;
    feedNotice = null;
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

  function openReading(target?: ReadItem, fromMine = false) {
    const item = target ?? contents[currentIndex];
    if (!item) return;
    if (reading && readItem?.id === item.id) return;
    if (!fromMine && (animating || replaceOnLoad)) return;
    if (!fromMine && dragging && dragAxis !== "x") return;

    if (dragging) {
      cancelDragFrame();
      dragging = false;
      activePointerId = null;
      dragAxis = "none";
    }

    // Giữ --drag-x lúc mở (tránh tiêu đề nhảy về tâm rồi nháy).
    // Reset sau khi reader hiện — lúc đó deck đã ẩn.
    queuedOffset = 0;
    setOffset(0);

    window.clearTimeout(closeTimer);
    window.clearTimeout(readerShowTimer);

    const serial = ++readSerial;
    clearArticleBody();
    readItem = item;
    readFromMine = fromMine;
    readerDismissing = false;
    reading = true;
    readerShown = false;

    // Hiện bài cùng nhịp header: opacity + 12px, 200ms ease (qua .reader.shown).
    readerShowTimer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (serial !== readSerial) return;
          readerShown = true;
          queuedDragX = 0;
          setDragX(0);
        });
      });
    }, 16);

    fetchArticleFor(item, serial);
  }

  /* Giống header/topbar: opacity + dịch 12px, 200ms ease. */
  const READ_MOTION_MS = 200;

  function finishCloseReading() {
    reading = false;
    readItem = null;
    readFromMine = false;
    readerDismissing = false;
    queuedDragX = 0;
    queuedOffset = 0;
    setDragX(0);
    setOffset(0);
    clearArticleBody();
  }

  function closeReading() {
    if (!reading || readerDismissing) return;

    readerShown = false;
    readerDismissing = true;
    readSerial += 1;
    // Giữ nội dung trong lúc fade — cùng nhịp header (opacity + 12px).
    window.clearTimeout(closeTimer);
    window.clearTimeout(readerShowTimer);
    closeTimer = window.setTimeout(finishCloseReading, READ_MOTION_MS);
  }

  function setReadDragX(node: HTMLElement, value: number) {
    node.style.setProperty("--read-drag-x", `${value}px`);
  }

  function clearReadDragX(node: HTMLElement) {
    node.style.removeProperty("--read-drag-x");
  }

  function readNext() {
    if (!canNext || animating || readFromMine || readerDismissing) return;

    const nextIndex = currentIndex + 1;
    readerShown = false;
    readerDismissing = true;
    readSerial += 1;
    window.clearTimeout(closeTimer);
    window.clearTimeout(readerShowTimer);
    closeTimer = window.setTimeout(() => {
      queuedDragX = 0;
      queuedOffset = 0;
      setDragX(0);
      setOffset(0);
      currentIndex = nextIndex;
      reading = false;
      readItem = null;
      readFromMine = false;
      readerDismissing = false;
      clearArticleBody();

      if (
        hasMore &&
        contents.length - nextIndex - 1 <= PREFETCH_REMAINING
      ) {
        void loadMore();
      }
    }, READ_MOTION_MS);
  }

  function readGestures(node: HTMLElement) {
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let lastX = 0;
    let axis: "none" | "x" | "y" = "none";
    let frame = 0;
    let queuedX = 0;

    function paintX(value: number) {
      queuedX = value;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setReadDragX(node, queuedX);
      });
    }

    function clearPointer() {
      pointerId = -1;
      axis = "none";
      node.classList.remove("is-swiping");
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    function springBack(fromX: number) {
      setReadDragX(node, fromX);
      requestAnimationFrame(() => setReadDragX(node, 0));
    }

    function onWheel(event: WheelEvent) {
      if (!readScroll || readScroll.scrollTop > 0 || event.deltaY >= -20) return;

      event.preventDefault();
      closeReading();
    }

    function onPointerDown(event: PointerEvent) {
      if (!event.isPrimary || reading === false || readerDismissing) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button, a, input, textarea, select")
      ) {
        return;
      }

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startTime = performance.now();
      lastX = 0;
      axis = "none";
      setReadDragX(node, 0);
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (axis === "none") {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx < AXIS_LOCK && ady < AXIS_LOCK) return;

        // Chi khoa ngang khi vuot phai (back); de vuot doc cuon binh thuong.
        if (adx > ady && dx > 0) {
          axis = "x";
          node.classList.add("is-swiping");
          try {
            node.setPointerCapture(pointerId);
          } catch {
            /* ignore */
          }
        } else {
          axis = "y";
          return;
        }
      }

      if (axis !== "x") return;

      event.preventDefault();
      const width = node.clientWidth || 320;
      lastX = Math.max(0, Math.min(width * 0.45, dx));
      paintX(lastX);
    }

    function onPointerUp(event: PointerEvent) {
      finishPointer(event, false);
    }

    function onPointerCancel(event: PointerEvent) {
      finishPointer(event, true);
    }

    function finishPointer(event: PointerEvent, cancelled: boolean) {
      if (event.pointerId !== pointerId) return;

      const releaseX = lastX;
      const dx = cancelled ? releaseX : Math.max(0, event.clientX - startX);
      const elapsed = Math.max(performance.now() - startTime, 1);
      const velocity = dx / elapsed;
      const wasX = axis === "x";
      const fromX = Math.max(releaseX, dx);

      if (node.hasPointerCapture(event.pointerId)) {
        node.releasePointerCapture(event.pointerId);
      }

      clearPointer();
      lastX = 0;

      if (!wasX || cancelled) {
        if (wasX) springBack(fromX);
        else setReadDragX(node, 0);
        return;
      }

      const shouldClose =
        dx >= READ_SWIPE_DISTANCE ||
        (dx >= MIN_FAST_DISTANCE && velocity >= FAST_VELOCITY);

      if (shouldClose) {
        // Về 0 rồi đóng — cùng hiệu ứng header (opacity + 12px, 200ms ease).
        setReadDragX(node, 0);
        closeReading();
        return;
      }

      springBack(fromX);
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove, { passive: false });
    node.addEventListener("pointerup", onPointerUp);
    node.addEventListener("pointercancel", onPointerCancel);

    return {
      destroy() {
        if (frame) cancelAnimationFrame(frame);
        clearReadDragX(node);
        node.removeEventListener("wheel", onWheel);
        node.removeEventListener("pointerdown", onPointerDown);
        node.removeEventListener("pointermove", onPointerMove);
        node.removeEventListener("pointerup", onPointerUp);
        node.removeEventListener("pointercancel", onPointerCancel);
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

  function getDragX(distance: number) {
    const width = deckElement?.clientWidth || 320;
    const limit = width * 0.42;
    // Vuot trai (am) de mo bai; phai chi nhe de khong vuong.
    let x = Math.max(-limit, Math.min(limit * 0.18, distance));
    if (x > 0) x *= 0.28;
    return x;
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

    // Khong keo the khi dang thao tac nut, video/poll, hoac dialog.
    if (
      target instanceof Element &&
      target.closest(
        "button, a, input, textarea, select, dialog, video, [data-feed-control]"
      )
    ) {
      return;
    }

    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startTime = performance.now();
    lastDistance = 0;
    lastDistanceX = 0;
    dragAxis = "none";

    measureDeck();
    dragging = true;
    queuedOffset = 0;
    queuedDragX = 0;
    setOffset(0);
    setDragX(0);

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

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    lastDistanceX = dx;
    lastDistance = dy;

    if (dragAxis === "none") {
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx < AXIS_LOCK && ady < AXIS_LOCK) return;

      if (adx > ady && contents[currentIndex]?.hasArticle) {
        dragAxis = "x";
        queuedOffset = 0;
        setOffset(0);
      } else if (ady >= adx) {
        dragAxis = "y";
        queuedDragX = 0;
        setDragX(0);
      } else {
        // Vuot ngang nhung the khong co bai — bo qua, khong khoa truc.
        return;
      }
    }

    if (dragAxis === "x") {
      queueDragX(getDragX(dx));
      return;
    }

    // Chi cap nhat vi tri toi da mot lan moi frame.
    queueOffset(getDragOffset(dy));
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

    const axis = dragAxis;
    const distanceX = cancelled
      ? lastDistanceX
      : event.clientX - startX;
    const distance = cancelled
      ? lastDistance
      : event.clientY - startY;

    const elapsed = Math.max(
      performance.now() - startTime,
      1
    );

    cancelDragFrame();
    activePointerId = null;
    dragAxis = "none";

    if (deckElement.hasPointerCapture(event.pointerId)) {
      deckElement.releasePointerCapture(event.pointerId);
    }

    if (axis === "x") {
      const velocity = Math.abs(distanceX) / elapsed;
      const canRead = !!contents[currentIndex]?.hasArticle;
      const shouldOpen =
        !cancelled &&
        canRead &&
        distanceX < 0 &&
        (
          Math.abs(distanceX) >= READ_SWIPE_DISTANCE ||
          (
            Math.abs(distanceX) >= MIN_FAST_DISTANCE &&
            velocity >= FAST_VELOCITY
          )
        );

      dragging = false;
      queuedOffset = 0;
      setOffset(0);

      if (shouldOpen) {
        // Giữ lệch vuốt; openReading reset --drag-x sau khi deck ẩn.
        openReading();
        return;
      }

      // Snap về vị trí cũ.
      setDragX(getDragX(distanceX));
      requestAnimationFrame(() => {
        queuedDragX = 0;
        setDragX(0);
      });
      return;
    }

    const velocity = Math.abs(distance) / elapsed;
    const height = measureDeck();
    setOffset(getDragOffset(distance));
    queuedDragX = 0;
    setDragX(0);

    if (cancelled || axis === "none" || Math.abs(distance) < 5) {
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
    void seenReporter.flush();

    if (contents.length === 0) {
      void loadMore();
    }
    pageVisible = !document.hidden;

    function handleVisibilityChange() {
      pageVisible = !document.hidden;

      if (document.hidden) {
        seenReporter.flushOnLeave();
      }

      if (!document.hidden) return;

      if (activePointerId !== null) {
        const pointer = activePointerId;
        activePointerId = null;
        dragging = false;
        dragAxis = "none";

        if (deckElement.hasPointerCapture(pointer)) {
          deckElement.releasePointerCapture(pointer);
        }
      }

      cancelDragFrame();
      queuedOffset = 0;
      queuedDragX = 0;

      if (animating) {
        if (fadeSwap) {
          cancelFade();
          animating = false;
        } else {
          completeTransition();
        }
      } else {
        setOffset(0);
        setDragX(0);
      }
    }

    function handlePageHide() {
      seenReporter.flushOnLeave();
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
    atmosphereMode = readTheme();
    atmosphereHydrated = true;
    const themeObserver = new MutationObserver(() => {
      atmosphereMode = readTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    // Đợi 1 frame có inline đúng màu, rồi mới bật transition morph.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        atmospherePaintReady = true;
      });
    });
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("resize", measureDeck);
    window.visualViewport?.addEventListener(
      "resize",
      measureDeck
    );
    measureDeck();

    return () => {
      seenReporter.flushOnLeave();
      window.clearTimeout(meTimer);
      themeObserver.disconnect();
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      window.removeEventListener("pagehide", handlePageHide);
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
      window.clearTimeout(readerShowTimer);
    };
  });
</script>

<div
  class="swipe-deck"
  class:is-reading={reading}
  class:is-reader-shown={readerShown}
>
  <div
    class="atmosphere"
    class:is-deep={reading}
    class:is-paint-ready={atmospherePaintReady}
    data-atm={atmosphereId}
    style={atmosphereCss || undefined}
    aria-hidden="true"
  >
    <div class="atmosphere-orb atmosphere-orb--a"></div>
    <div class="atmosphere-orb atmosphere-orb--b"></div>
    <div class="atmosphere-deep"></div>
    <div class="atmosphere-grain"></div>
  </div>

  <header
    class="topbar"
    class:is-collection={collectionMode}
    inert={reading || sheetOpen}
  >
    {#if collection}
      <div class="collection-bar">
        <a class="collection-back" href="/collections" aria-label="Về bộ sưu tập">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M14.5 6.5 9 12l5.5 5.5"
            />
          </svg>
        </a>

        <strong class="collection-title">{collection.title}</strong>
      </div>
    {:else}
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
          {#if section.key === "loved"}
            <a class="section section-link" href="/collections">Bộ sưu tập</a>
          {/if}
        {/each}
      </nav>
    {/if}
    <div class="topbar-tools">
      <AmbientPanel />
      <ThemeToggle />
    </div>
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
        style={`transform: translate3d(${index === currentIndex ? "var(--drag-x, 0px)" : "0px"}, calc(${(index - currentIndex) * 100}% + var(--drag-offset, 0px)), 0);`}
        ontransitionend={(event) => handleTransitionEnd(event, index)}
      >
        {#if index === currentIndex && activeItem}
          <ContentCard
            {content}
            active
            leaving={readingOut}
            onRead={openReading}
          >
            {#snippet actions()}
              {@render feedRail("card")}
            {/snippet}
          </ContentCard>
        {:else}
          <ContentCard
            {content}
            active={false}
            leaving={false}
            onRead={openReading}
          />
        {/if}
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
        class="dock-item dock-write"
        aria-label="Viết bài"
        aria-haspopup="dialog"
        aria-expanded={writeOpen}
        onpointerdown={warmWrite}
        onclick={openWrite}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Viết bài</span>
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
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
        {/if}
        <span>{user?.displayName?.trim() || "Tài khoản"}</span>
      </button>
    </nav>
  </footer>

  {#snippet railCount(field: "likeText" | "saveText" | "shareText")}
    <span class="rail-count">
      <span
        class="rail-count-stage"
        class:is-moving={railMoving}
        class:to-next={railDir === 1}
        class:to-prev={railDir === -1}
      >
        {#if railMoving && railEnter}
          <span class="rail-count-layer is-out">{railShown[field]}</span>
          <span class="rail-count-layer is-in">{railEnter[field]}</span>
        {:else}
          <span class="rail-count-layer">{railShown[field]}</span>
        {/if}
      </span>
    </span>
  {/snippet}

  {#snippet feedRail(variant: "card" | "side")}
    {#if activeItem}
      <div
        class="read-rail"
        class:read-rail--card={variant === "card"}
        class:read-rail--side={variant === "side"}
        inert={reading || sheetOpen}
        aria-label="Tương tác"
      >
        <div class="rail-item">
          <button
            type="button"
            class="read-icon"
            class:active={railView?.liked ?? false}
            aria-label="Yêu thích"
            aria-pressed={railView?.liked ?? false}
            onclick={() => toggleReaction("like")}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 13.2S2.6 10 2.6 6.1A2.7 2.7 0 0 1 8 4.9a2.7 2.7 0 0 1 5.4 1.2C13.4 10 8 13.2 8 13.2Z" />
            </svg>
          </button>
          {@render railCount("likeText")}
        </div>
        <div class="rail-item">
          <button
            type="button"
            class="read-icon"
            class:active={railView?.saved ?? false}
            aria-label="Lưu"
            aria-pressed={railView?.saved ?? false}
            onclick={() => toggleReaction("save")}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.3 2.8h7.4v10.6L8 10.9l-3.7 2.5Z" />
            </svg>
          </button>
          {@render railCount("saveText")}
        </div>
        <div class="rail-item">
          <button
            type="button"
            class="read-icon read-share"
            class:active={sharedId === activeItem.id}
            aria-label={sharedId === activeItem.id ? "Đã chia sẻ" : "Chia sẻ"}
            onclick={shareCurrent}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 10V2.6M5.2 5.2 8 2.4l2.8 2.8M3.4 8.6v4.6h9.2V8.6" />
            </svg>
          </button>
          {@render railCount("shareText")}
        </div>
      </div>
    {/if}
  {/snippet}

  {#if activeItem}
    {@render feedRail("side")}
  {/if}

  {#if reading && readItem}
    {@const item = readItem}
    <div
      class="reader-dock"
      class:shown={readerShown}
      inert={sheetOpen}
    >
      <div class="reader-dock-react" aria-label="Tương tác">
        <div class="rail-item">
          <button
            type="button"
            class="read-icon"
            class:active={railView?.liked ?? false}
            aria-label="Yêu thích"
            aria-pressed={railView?.liked ?? false}
            onclick={() => toggleReaction("like")}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 13.2S2.6 10 2.6 6.1A2.7 2.7 0 0 1 8 4.9a2.7 2.7 0 0 1 5.4 1.2C13.4 10 8 13.2 8 13.2Z" />
            </svg>
          </button>
          {@render railCount("likeText")}
        </div>
        <div class="rail-item">
          <button
            type="button"
            class="read-icon"
            class:active={railView?.saved ?? false}
            aria-label="Lưu"
            aria-pressed={railView?.saved ?? false}
            onclick={() => toggleReaction("save")}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.3 2.8h7.4v10.6L8 10.9l-3.7 2.5Z" />
            </svg>
          </button>
          {@render railCount("saveText")}
        </div>
        <div class="rail-item">
          <button
            type="button"
            class="read-icon read-share"
            class:active={sharedId === item.id}
            aria-label={sharedId === item.id ? "Đã chia sẻ" : "Chia sẻ"}
            onclick={shareCurrent}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 10V2.6M5.2 5.2 8 2.4l2.8 2.8M3.4 8.6v4.6h9.2V8.6" />
            </svg>
          </button>
          {@render railCount("shareText")}
        </div>
      </div>
      <div class="reader-dock-nav">
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
    </div>
    <article
      class="reader"
      class:shown={readerShown}
      use:readGestures
      aria-labelledby={`read-title-${item.id}`}
    >
      <div class="reader-scroll" bind:this={readScroll}>
        {#key item.id}
          <div
            class="reader-column"
            class:body-ready={articleReady &&
              articleForId === item.id &&
              !articleError}
          >
            <h2 id={`read-title-${item.id}`}>{item.title}</h2>

            {#if articleError}
              <p class="reader-wait">{articleError}</p>
            {:else if !(articleReady && articleForId === item.id)}
              <p class="reader-wait">Đang mở bài…</p>
            {:else}
              {#each articleBlocks as block, index (`${item.id}-${block.kind}-${index}`)}
                {#if block.kind === "heading"}
                  <h3>{block.text}</h3>
                {:else if block.kind === "quote"}
                  <blockquote class="reader-graph">
                    {#each splitSentences(block.text) as line, lineIndex (`${item.id}-q-${index}-${lineIndex}`)}
                      <span class="reader-line">
                        {#if lineIndex === 0}
                          <span class="reader-ornament" aria-hidden="true"
                            >{readMarks[item.theme] ?? "❋"}</span
                          >
                        {/if}
                        {line}
                      </span>
                    {/each}
                  </blockquote>
                {:else}
                  <p class="reader-graph">
                    {#each splitSentences(block.text) as line, lineIndex (`${item.id}-p-${index}-${lineIndex}`)}
                      <span class="reader-line">{line}</span>
                    {/each}
                  </p>
                {/if}
              {/each}
              <p class="reader-end">Hết bài.</p>
            {/if}
          </div>
        {/key}
      </div>
    </article>
  {/if}

  <p class="loading-slot" aria-live="polite">
    {#if loading && !canNext}
      <span>{NEXT_PAGE_STATUS}</span>
    {/if}
    <span class="loading-slot-sizer" aria-hidden="true">
      {NEXT_PAGE_STATUS}
    </span>
  </p>

  <p class="other-items-slot" aria-live="polite">
    {#if showingAllSeen}
      <span>{ALL_SEEN_NOTE}</span>
    {:else if showingOtherItems}
      <span>{OTHER_ITEMS_NOTE}</span>
    {/if}
    <span class="other-items-sizer" aria-hidden="true">
      {OTHER_ITEMS_NOTE}
    </span>
  </p>

  <div class="end-slot" aria-live="polite">
    {#if atEnd}
      <div class="end-slot-face">
        <span>{collectionMode ? COLLECTION_END_NOTE : END_NOTE}</span>
        {#if collectionMode}
          <a class="end-slot-link" href="/collections">Xem bộ sưu tập</a>
        {:else}
          <button type="button" onclick={restartSession}>
            {RESTART_LABEL}
          </button>
        {/if}
      </div>
    {/if}
    <div class="end-slot-sizer" aria-hidden="true">
      <span>{collectionMode ? COLLECTION_END_NOTE : END_NOTE}</span>
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
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
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
    position: relative;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
    min-width: 0;
    padding: 20px 30px 0 18px;
  }

  .topbar-tools {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
  }

  .topbar-tools :global(.ambient),
  .topbar-tools :global(.theme-toggle) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .topbar.is-collection {
    align-items: center;
    gap: 10px;
    padding-top: 12px;
  }

  .collection-bar {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .collection-back {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition:
      color 0.18s ease,
      transform 0.18s ease;
  }

  .collection-back svg {
    width: 1.15rem;
    height: 1.15rem;
  }

  .collection-back:hover {
    color: var(--color-primary);
    transform: translateX(-1px);
  }

  .collection-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    margin: 0;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 0.98rem;
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .end-slot-link {
    justify-self: center;
    padding: 10px 14px;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
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

  .section-link {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .dock .dock-item {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 64px;
    padding: 4px 2px;
    border: 0;
    background: transparent;
    color: var(--color-quiet);
    font-size: 10px;
    letter-spacing: 0.02em;
    white-space: nowrap;
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
    color: var(--color-quiet);
  }

  .dock-write svg {
    color: #f0c94a;
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

    .topbar.is-collection {
      gap: 8px;
      padding-top: 12px;
      padding-left: 10px;
    }

    .collection-bar {
      gap: 8px;
    }

    .collection-back {
      width: 2.1rem;
      height: 2.1rem;
    }

    .section {
      padding: 10px 10px;
      font-size: 12px;
    }

    .bottom {
      padding: 8px 14px max(14px, env(safe-area-inset-bottom));
    }

    .dock {
      gap: 6px;
    }

    .dock .dock-item {
      min-width: 58px;
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
    .slide {
      transition-duration: 0.01ms;
    }

    .rail-count-stage.is-moving .is-out,
    .rail-count-stage.is-moving .is-in {
      animation-duration: 0.01ms;
    }
  }

  .topbar,
  .bottom,
  .read-rail {
    /* Cùng nhịp reader-dock: opacity + dịch 12px, 200ms ease. */
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
  }

  .deck-viewport {
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
  }

  /* Mở bài: chrome feed ẩn theo hướng “ra ngoài”; đóng thì ngược lại. */
  .swipe-deck.is-reader-shown .topbar {
    opacity: 0;
    transform: translate3d(0, -12px, 0);
    pointer-events: none;
  }

  .swipe-deck.is-reader-shown .bottom {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
    pointer-events: none;
  }

  .swipe-deck.is-reader-shown .read-rail--card {
    opacity: 0;
    transform: translate3d(0, -12px, 0);
    pointer-events: none;
  }

  .swipe-deck.is-reader-shown .read-rail--side {
    opacity: 0;
    transform: translate3d(12px, -50%, 0);
    pointer-events: none;
  }

  /* Cùng nhịp header (is-reader-shown): opacity + 12px, 200ms ease. */
  .swipe-deck.is-reader-shown .deck-viewport {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translate3d(0, -12px, 0);
  }

  .reader {
    --read-shift-x: 12px;
    /* Chừa chỗ cho reader-dock — chữ không chạy vào vùng nút. */
    --reader-dock-space: calc(58px + env(safe-area-inset-bottom, 0px));
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
    padding-bottom: var(--reader-dock-space);
    background: transparent;
    /* Giống header: ẩn = mờ + dịch 12px; hiện = ngược lại. */
    opacity: 0;
    transform: translate3d(
      calc(var(--read-shift-x) + var(--read-drag-x, 0px)),
      0,
      0
    );
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
    container-type: inline-size;
    touch-action: pan-y;
    will-change: transform, opacity;
  }

  .reader.shown {
    --read-shift-x: 0px;
    opacity: 1;
    transform: translate3d(var(--read-drag-x, 0px), 0, 0);
  }

  .reader.is-swiping {
    transition: none !important;
  }

  .reader-dock {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 18px max(12px, calc(env(safe-area-inset-bottom) + 8px));
    background: transparent;
    opacity: 0;
    transform: translateY(12px);
    pointer-events: none;
    transition:
      opacity 200ms ease,
      transform 200ms ease !important;
  }

  .reader-dock.shown {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .reader-dock-react,
  .reader-dock-nav {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .reader-dock .rail-item {
    flex-direction: row;
    gap: 6px;
  }

  .reader-dock .rail-count {
    width: auto;
    min-width: 1.2rem;
    text-align: left;
  }

  /* Mobile: hàng ngang trên icon. Desktop: cột dọc bên phải. */
  .read-rail--card {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 0;
  }

  .read-rail--side {
    display: none;
  }

  .read-rail--card .rail-item {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }

  .read-rail--card .rail-count {
    width: auto;
    min-width: 1.1rem;
    text-align: left;
  }

  @media (min-width: 641px) {
    .read-rail--card {
      display: none;
    }

    .read-rail--side {
      position: absolute;
      top: 50%;
      right: 22px;
      z-index: 5;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transform: translate3d(0, -50%, 0);
    }

    .read-rail--side .rail-item {
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }

    .read-rail--side .rail-count {
      width: 2.4rem;
      min-width: 0;
      text-align: center;
    }
  }

  .rail-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .rail-count {
    position: relative;
    display: block;
    width: 2.4rem;
    height: 13px;
    overflow: hidden;
    color: var(--color-text-muted);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 13px;
    text-align: center;
  }

  .rail-count-stage {
    position: relative;
    display: block;
    height: 100%;
  }

  .rail-count-layer {
    display: block;
    height: 13px;
    line-height: 13px;
  }

  .rail-count-stage.is-moving .rail-count-layer {
    position: absolute;
    inset: 0;
  }

  .rail-count-stage.is-moving.to-next .is-out {
    animation: rail-out-up var(--rail-ms, 400ms) ease both;
  }

  .rail-count-stage.is-moving.to-next .is-in {
    animation: rail-in-up var(--rail-ms, 400ms) ease both;
  }

  .rail-count-stage.is-moving.to-prev .is-out {
    animation: rail-out-down var(--rail-ms, 400ms) ease both;
  }

  .rail-count-stage.is-moving.to-prev .is-in {
    animation: rail-in-down var(--rail-ms, 400ms) ease both;
  }

  @keyframes rail-out-up {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(-110%);
      opacity: 0;
    }
  }

  @keyframes rail-in-up {
    from {
      transform: translateY(110%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes rail-out-down {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(110%);
      opacity: 0;
    }
  }

  @keyframes rail-in-down {
    from {
      transform: translateY(-110%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
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
    padding-top: max(28px, calc(env(safe-area-inset-top, 0px) + 16px));
    padding-bottom: 20px;
  }

  .reader-column {
    width: min(42rem, calc(100cqi - 48px));
    margin-right: auto;
    margin-left: auto;
  }

  .reader-scroll .reader-column {
    padding-bottom: 12px;
  }

  .reader-column.body-ready :is(h3, .reader-graph, .reader-end) {
    animation: reader-body-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes reader-body-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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
      --reader-dock-space: calc(54px + env(safe-area-inset-bottom, 0px));
    }

    .reader-dock {
      padding: 8px 14px max(10px, calc(env(safe-area-inset-bottom) + 6px));
      gap: 12px;
    }

    .reader-dock-react,
    .reader-dock-nav {
      gap: 10px;
    }

    .reader-scroll {
      padding-top: max(20px, calc(env(safe-area-inset-top, 0px) + 12px));
      padding-bottom: 16px;
    }

    .read-rail--card {
      gap: 16px;
    }

    .reader-column {
      width: min(42rem, calc(100cqi - 32px));
      margin-left: 16px;
      margin-right: 16px;
    }
  }
</style>
