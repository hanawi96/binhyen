<script lang="ts">
  import { onMount, untrack } from "svelte";
  import {
    loadMinePage,
    loadMinePosts,
    mineGeneration,
    prefetchMine,
    withdrawPost,
    type MineCounts,
    type MineItem,
    type MineKind,
    type MineOpenable,
    type MinePost
  } from "./mine-client";

  type Tab = MineKind | "post";
  type ListState<T = MineItem> = {
    items: T[];
    next: string | null;
    status: "idle" | "loading" | "ready" | "error";
    more: boolean;
  };

  let {
    open,
    reading,
    signedIn,
    postsVersion,
    postNews,
    onPostsSeen,
    startTab,
    reactions,
    onClose,
    onOpenItem,
    onSetReaction,
    onEditPost
  }: {
    open: boolean;
    reading: boolean;
    signedIn: boolean;
    /** Tang len khi vua viet bai, de tai lai "Da viet". */
    postsVersion: number;
    /** So bai vua co ket qua duyet ma chua xem. */
    postNews: number;
    /** Trang dau "Da viet" da tai: may chu da ghi nhan la da xem. */
    onPostsSeen: () => void;
    /** Tab can mo moi lan ngan mo; null thi giu tab cu. */
    startTab: Tab | null;
    reactions: Record<string, { liked: boolean; saved: boolean }>;
    onClose: () => void;
    onOpenItem: (item: MineOpenable) => void;
    onSetReaction: (item: MineItem, kind: MineKind, on: boolean) => void;
    onEditPost: (item: MinePost) => void;
  } = $props();

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "like", label: "Đã thích" },
    { key: "save", label: "Đã lưu" },
    { key: "post", label: "Đã viết" }
  ];
  const EMPTY_TEXT: Record<MineKind, string> = {
    like: "Chưa có bài nào bạn thích. Chạm ♡ khi một điều chạm đến bạn.",
    save: "Chưa có bài nào được lưu. Lưu lại để đọc khi cần một khoảng lặng."
  };
  const POST_STATUS: Record<MinePost["status"], string> = {
    draft: "Chờ duyệt",
    published: "Đã đăng",
    archived: "Không được duyệt"
  };
  const SWIPE_DISTANCE = 60;
  const CLOSE_DISTANCE = 96;

  const relative = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
  const uid = $props.id();
  const titleId = `mine-space-title-${uid}`;

  let mounted = $state(false);
  let panel = $state<HTMLElement | null>(null);
  let dragY = $state(0);
  let dragPointer = $state<number | null>(null);
  let dragStart = 0;
  let shown = $derived(open && mounted);

  onMount(() => {
    const timer = window.setTimeout(() => {
      mounted = true;
    }, 16);
    return () => window.clearTimeout(timer);
  });

  $effect(() => {
    if (shown) panel?.focus({ preventScroll: true });
  });

  function onGrabDown(event: PointerEvent) {
    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }
    dragPointer = event.pointerId;
    dragStart = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onGrabMove(event: PointerEvent) {
    if (event.pointerId !== dragPointer) return;
    dragY = Math.max(0, event.clientY - dragStart);
  }

  function onGrabEnd(event: PointerEvent) {
    if (event.pointerId !== dragPointer) return;
    dragPointer = null;
    const close = dragY > CLOSE_DISTANCE;
    dragY = 0;
    if (close) onClose();
  }

  function freshList<T = MineItem>(): ListState<T> {
    return { items: [], next: null, status: "idle", more: false };
  }

  let tab = $state<Tab>("like");
  let lists = $state<Record<MineKind, ListState>>({
    like: freshList(),
    save: freshList()
  });
  let counts = $state<MineCounts | null>(null);
  let posts = $state<ListState<MinePost>>(freshList());
  let postTotal = $state<number | null>(null);
  let postOwner: string | null = null;
  let postEpoch = 0;
  let loadedGeneration = -1;
  let askWithdraw = $state("");
  let withdrawing = $state("");
  let postError = $state<{ id: string; text: string } | null>(null);
  let body = $state<HTMLElement | null>(null);
  let sentinel = $state<HTMLElement | null>(null);
  let swipeStart: { x: number; y: number } | null = null;

  function ago(seconds: number): string {
    const diff = Math.round(seconds - Date.now() / 1000);
    const abs = Math.abs(diff);

    if (abs < 60) return "vừa xong";
    if (abs < 3600) return relative.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return relative.format(Math.round(diff / 3600), "hour");
    if (abs < 2592000) return relative.format(Math.round(diff / 86400), "day");
    if (abs < 31536000) {
      return relative.format(Math.round(diff / 2592000), "month");
    }
    return relative.format(Math.round(diff / 31536000), "year");
  }

  function isOff(item: MineItem, kind: MineKind): boolean {
    const state = reactions[item.id];
    if (!state) return false;
    return kind === "like" ? !state.liked : !state.saved;
  }

  function ensure(kind: MineKind) {
    const list = lists[kind];
    if (list.status === "loading" || list.status === "ready") return;

    list.status = "loading";

    void prefetchMine(kind).then((page) => {
      if (!page) {
        lists[kind].status = "error";
        return;
      }

      lists[kind] = {
        items: page.items,
        next: page.nextCursor,
        status: "ready",
        more: false
      };
      if (page.counts) counts = page.counts;
    });
  }

  function loadMore(kind: MineKind) {
    const list = lists[kind];
    if (list.status !== "ready" || !list.next || list.more) return;

    list.more = true;
    const cursor = list.next;

    void loadMinePage(kind, cursor).then((page) => {
      const current = lists[kind];
      if (current.next !== cursor) return;

      current.more = false;
      if (!page) return;

      const known = new Set(current.items.map((item) => item.id));
      current.items = [
        ...current.items,
        ...page.items.filter((item) => !known.has(item.id))
      ];
      current.next = page.nextCursor;
    });
  }

  function ensurePosts() {
    if (posts.status === "loading" || posts.status === "ready") return;

    posts.status = "loading";
    const epoch = postEpoch;

    void loadMinePosts(null).then((page) => {
      if (epoch !== postEpoch) return;
      if (!page) {
        posts.status = "error";
        return;
      }

      posts = {
        items: page.items,
        next: page.nextCursor,
        status: "ready",
        more: false
      };
      postTotal = page.total;
      onPostsSeen();
    });
  }

  function loadMorePosts() {
    if (posts.status !== "ready" || !posts.next || posts.more) return;

    posts.more = true;
    const cursor = posts.next;

    void loadMinePosts(cursor).then((page) => {
      if (posts.next !== cursor) return;

      posts.more = false;
      if (!page) return;

      const known = new Set(posts.items.map((item) => item.id));
      posts.items = [
        ...posts.items,
        ...page.items.filter((item) => !known.has(item.id))
      ];
      posts.next = page.nextCursor;
    });
  }

  async function withdraw(item: MinePost) {
    if (withdrawing) return;

    withdrawing = item.id;
    postError = null;
    const result = await withdrawPost(item.id);
    withdrawing = "";

    if (!result.ok) {
      postError = { id: item.id, text: result.message };
      return;
    }

    askWithdraw = "";
    posts.items = posts.items.filter((entry) => entry.id !== item.id);
    if (postTotal !== null) postTotal = Math.max(0, postTotal - 1);
  }

  function chooseTab(key: Tab) {
    if (key === tab) return;
    tab = key;
    body?.scrollTo({ top: 0 });
  }

  function retry(kind: MineKind) {
    lists[kind] = freshList();
    ensure(kind);
  }

  // Moi lan mo: neu da thich / luu them o ngoai thi tai lai.
  $effect(() => {
    if (!open) return;

    const current = mineGeneration();

    if (current !== loadedGeneration) {
      loadedGeneration = current;
      lists = { like: freshList(), save: freshList() };
    }
  });

  // Doi tai khoan hoac vua viet bai thi bo danh sach bai cu.
  $effect(() => {
    const key = `${signedIn}:${postsVersion}`;
    if (key === postOwner) return;
    postOwner = key;
    postEpoch += 1;
    posts = freshList();
    postTotal = null;
  });

  $effect(() => {
    if (open && startTab) untrack(() => chooseTab(startTab));
  });

  $effect(() => {
    if (!open) return;
    if (tab !== "post") ensure(tab);
    else if (signedIn) ensurePosts();
  });

  $effect(() => {
    if (!body || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (tab !== "post") loadMore(tab);
        else if (signedIn) loadMorePosts();
      },
      { root: body, rootMargin: "320px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  function onBodyDown(event: PointerEvent) {
    swipeStart =
      event.pointerType === "mouse"
        ? null
        : { x: event.clientX, y: event.clientY };
  }

  function onBodyUp(event: PointerEvent) {
    if (!swipeStart) return;

    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;

    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) {
      return;
    }

    const index = tabs.findIndex((item) => item.key === tab);
    const next = tabs[index + (dx < 0 ? 1 : -1)];
    if (next) chooseTab(next.key);
  }
</script>

<div
  class="mine-space"
  class:shown
  class:behind={reading}
  class:dragging={dragPointer !== null}
  style:--mine-drag="{dragY}px"
  aria-hidden={!open || reading}
>
  <button
    type="button"
    class="mine-veil"
    tabindex="-1"
    aria-label="Đóng không gian của tôi"
    onclick={onClose}
  ></button>

  <section
    class="mine-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    inert={!open || reading}
    bind:this={panel}
  >
    <div
      class="mine-top"
      onpointerdown={onGrabDown}
      onpointermove={onGrabMove}
      onpointerup={onGrabEnd}
      onpointercancel={onGrabEnd}
    >
      <p class="mine-eyebrow">Không gian riêng</p>
      <div class="mine-head">
        <h2 id={titleId} class="mine-title-hero">Của tôi</h2>
        <button
          type="button"
          class="mine-close"
          aria-label="Đóng"
          onclick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />
          </svg>
        </button>
      </div>

      <div class="mine-tabs" role="tablist" aria-label="Nội dung của tôi">
        {#each tabs as item (item.key)}
          <button
            type="button"
            role="tab"
            class="mine-tab"
            class:active={item.key === tab}
            aria-selected={item.key === tab}
            onclick={() => chooseTab(item.key)}
          >
            {item.label}
            {#if item.key === "like" && counts}
              <span class="mine-count">{counts.liked}</span>
            {:else if item.key === "save" && counts}
              <span class="mine-count">{counts.saved}</span>
            {:else if item.key === "post" && signedIn && postTotal !== null}
              <span class="mine-count">{postTotal}</span>
            {/if}
            {#if item.key === "post" && postNews > 0}
              <span class="mine-dot" aria-hidden="true"></span>
              <span class="sr-only">, có kết quả duyệt mới</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

  <div
    class="mine-body"
    role="tabpanel"
    bind:this={body}
    onpointerdown={onBodyDown}
    onpointerup={onBodyUp}
    onpointercancel={() => (swipeStart = null)}
  >
    {#if tab === "post" && !signedIn}
      <div class="mine-note">
        <p>Bài bạn viết sẽ nằm ở đây.</p>
        <p class="mine-soft">
          Đăng nhập để viết bài và xem kết quả duyệt.
        </p>
      </div>
    {:else if tab === "post"}
      {#if posts.status === "error"}
        <div class="mine-note">
          <p>Chưa tải được danh sách.</p>
          <button
            type="button"
            class="mine-retry"
            onclick={() => {
              posts = freshList();
              ensurePosts();
            }}
          >
            Thử lại
          </button>
        </div>
      {:else if posts.status !== "ready"}
        <ul class="mine-list" aria-hidden="true">
          {#each [0, 1, 2, 3] as index (index)}
            <li class="mine-row mine-ghost">
              <span></span>
              <span></span>
            </li>
          {/each}
        </ul>
      {:else if posts.items.length === 0}
        <div class="mine-note">
          <p>Bạn chưa viết bài nào.</p>
          <p class="mine-soft">Chạm + để viết. Bài sẽ hiện trên trang chủ sau khi được duyệt.</p>
        </div>
      {:else}
        <ul class="mine-list">
          {#each posts.items as item (item.id)}
            {@const label = POST_STATUS[item.status]}
            <li class="mine-row">
              {#if item.status === "published"}
                <button
                  type="button"
                  class="mine-open"
                  onclick={() => onOpenItem(item)}
                >
                  <span class="mine-kicker">{item.category}</span>
                  <span class="mine-title">{item.title}</span>
                </button>
              {:else}
                <div class="mine-open mine-static">
                  <span class="mine-kicker">{item.category}</span>
                  <span class="mine-title">{item.title}</span>
                  {#if item.status === "archived" && item.note}
                    <span class="mine-reason">Lý do: {item.note}</span>
                  {/if}
                  {#if item.status === "draft"}
                    <span class="mine-actions">
                      {#if askWithdraw === item.id}
                        <span class="mine-ask">Rút bài này? Bài sẽ bị xoá.</span>
                        <button
                          type="button"
                          class="mine-act mine-danger"
                          disabled={withdrawing !== ""}
                          onclick={() => withdraw(item)}
                        >
                          {withdrawing === item.id ? "Đang rút…" : "Rút bài"}
                        </button>
                        <button
                          type="button"
                          class="mine-act"
                          disabled={withdrawing !== ""}
                          onclick={() => (askWithdraw = "")}
                        >
                          Giữ lại
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="mine-act"
                          onclick={() => onEditPost(item)}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          class="mine-act"
                          onclick={() => {
                            askWithdraw = item.id;
                            postError = null;
                          }}
                        >
                          Rút bài
                        </button>
                      {/if}
                    </span>
                    {#if postError?.id === item.id}
                      <span class="mine-reason mine-error" role="alert">
                        {postError.text}
                      </span>
                    {/if}
                  {/if}
                </div>
              {/if}
              <div class="mine-side">
                <span class="mine-time">{ago(item.createdAt)}</span>
                <span
                  class="mine-status"
                  class:mine-fresh={item.fresh}
                  data-status={item.status}
                >
                  {item.fresh ? `Mới · ${label}` : label}
                </span>
              </div>
            </li>
          {/each}
        </ul>
        {#if posts.more}
          <p class="mine-soft mine-more">Đang tải thêm…</p>
        {/if}
      {/if}
    {:else}
      {@const kind = tab}
      {@const list = lists[kind]}
      {#if list.status === "error"}
        <div class="mine-note">
          <p>Chưa tải được danh sách.</p>
          <button type="button" class="mine-retry" onclick={() => retry(kind)}>
            Thử lại
          </button>
        </div>
      {:else if list.status !== "ready"}
        <ul class="mine-list" aria-hidden="true">
          {#each [0, 1, 2, 3] as index (index)}
            <li class="mine-row mine-ghost">
              <span></span>
              <span></span>
            </li>
          {/each}
        </ul>
      {:else if list.items.length === 0}
        <div class="mine-note">
          <p>{EMPTY_TEXT[kind]}</p>
        </div>
      {:else}
        <ul class="mine-list">
          {#each list.items as item (item.id)}
            {@const off = isOff(item, kind)}
            <li class="mine-row" class:off>
              <button
                type="button"
                class="mine-open"
                onclick={() => onOpenItem(item)}
              >
                <span class="mine-kicker">{item.category}</span>
                <span class="mine-title">{item.title}</span>
              </button>
              <div class="mine-side">
                <span class="mine-time">{ago(item.reactedAt)}</span>
                {#if off}
                  <button
                    type="button"
                    class="mine-undo"
                    onclick={() => onSetReaction(item, kind, true)}
                  >
                    Hoàn tác
                  </button>
                {:else}
                  <button
                    type="button"
                    class="mine-icon mine-on"
                    aria-label={kind === "like" ? "Bỏ thích" : "Bỏ lưu"}
                    onclick={() => onSetReaction(item, kind, false)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      {#if kind === "like"}
                        <path d="M8 13.2S2.6 10 2.6 6.1A2.7 2.7 0 0 1 8 4.9a2.7 2.7 0 0 1 5.4 1.2C13.4 10 8 13.2 8 13.2Z" />
                      {:else}
                        <path d="M4.3 2.8h7.4v10.6L8 10.9l-3.7 2.5Z" />
                      {/if}
                    </svg>
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        {#if list.more}
          <p class="mine-soft mine-more">Đang tải thêm…</p>
        {/if}
        {#if !signedIn}
          <p class="mine-soft mine-foot">
            Đang lưu trên trình duyệt này. Đăng nhập để không mất.
          </p>
        {/if}
      {/if}
    {/if}
    <div class="mine-sentinel" bind:this={sentinel} aria-hidden="true"></div>
  </div>
  </section>
</div>

<style>
  .mine-space {
    position: absolute;
    inset: 0;
    z-index: 8;
    display: grid;
    place-items: stretch;
    pointer-events: none;
    visibility: hidden;
    opacity: 0;
    transition:
      opacity 200ms ease,
      visibility 0s linear 200ms;
  }

  .mine-space.shown {
    pointer-events: auto;
    visibility: visible;
    opacity: 1;
    transition:
      opacity 200ms ease,
      visibility 0s;
  }

  .mine-space.behind {
    opacity: 0;
    pointer-events: none;
  }

  .mine-veil {
    position: absolute;
    inset: 0;
    z-index: 0;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }

  .mine-panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    max-height: 100%;
    margin: 0 auto;
    outline: none;
    transform: translateY(10px);
    opacity: 0;
    transition:
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 200ms ease;
  }

  .mine-space.shown .mine-panel {
    transform: translateY(var(--mine-drag, 0px));
    opacity: 1;
  }

  .mine-space.dragging .mine-panel {
    transition: none;
  }

  .mine-top {
    flex: none;
    padding: 16px 18px 0;
    touch-action: none;
  }

  .mine-eyebrow {
    margin: 0 0 6px;
    color: color-mix(in oklab, var(--color-text) 55%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .mine-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .mine-title-hero {
    margin: 0;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(1.7rem, 6vw, 2.35rem);
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  .mine-close {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    margin-top: 4px;
    padding: 0;
    border: 1px solid color-mix(in oklab, var(--color-text) 22%, transparent);
    border-radius: 50%;
    background: color-mix(in oklab, var(--color-surface) 42%, transparent);
    color: var(--color-text);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
  }

  .mine-close svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .mine-icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--color-text-muted);
    border-radius: 50%;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
  }

  .mine-icon svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mine-on svg {
    fill: currentColor;
  }

  .mine-tabs {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 0 14px;
  }

  .mine-tab {
    padding: 8px 14px;
    border: 1px solid color-mix(in oklab, var(--color-text) 14%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-surface) 28%, transparent);
    color: color-mix(in oklab, var(--color-text) 72%, transparent);
    font: inherit;
    font-size: 13px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    cursor: pointer;
    transition:
      background 180ms ease,
      border-color 180ms ease,
      color 180ms ease;
  }

  .mine-tab.active {
    border-color: color-mix(in oklab, var(--color-text) 28%, transparent);
    background: color-mix(in oklab, var(--color-surface) 58%, transparent);
    color: var(--color-text);
    font-weight: 650;
  }

  .mine-count {
    margin-left: 3px;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .mine-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 22px max(28px, env(safe-area-inset-bottom));
    touch-action: pan-y;
    mask-image: linear-gradient(
      to bottom,
      transparent,
      #000 12px,
      #000 calc(100% - 28px),
      transparent
    );
  }

  .mine-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .mine-row {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 76px;
    border-bottom: 1px solid
      color-mix(in oklab, var(--color-text) 10%, transparent);
    transition: opacity 200ms ease;
  }

  .mine-row.off {
    opacity: 0.45;
  }

  .mine-open {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    padding: 14px 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .mine-kicker {
    color: var(--color-eyebrow);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .mine-title {
    display: -webkit-box;
    overflow: hidden;
    font-family: var(--font-editorial);
    font-size: 18px;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .mine-side {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .mine-time {
    color: var(--color-text-muted);
    font-size: 11px;
  }

  .mine-static {
    cursor: default;
  }

  .mine-reason {
    color: var(--color-sheet-body);
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .mine-error {
    color: var(--color-error);
  }

  .mine-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
    margin-top: 2px;
  }

  .mine-ask {
    color: var(--color-sheet-body);
    font-size: 12px;
  }

  .mine-act {
    padding: 4px 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 12px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .mine-act.mine-danger {
    color: var(--color-error);
    font-weight: 600;
  }

  .mine-act:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  .mine-status {
    padding: 2px 8px;
    border: 1px solid var(--color-sheet-line);
    border-radius: 999px;
    color: var(--color-text-muted);
    font-size: 10px;
    white-space: nowrap;
  }

  .mine-status[data-status="published"] {
    color: var(--color-primary);
  }

  .mine-status.mine-fresh {
    border-color: transparent;
    background: var(--color-primary);
    color: var(--color-surface);
    font-weight: 650;
  }

  .mine-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 4px;
    border-radius: 50%;
    background: var(--color-primary);
    vertical-align: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .mine-undo,
  .mine-retry {
    padding: 4px 0;
    border: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 12px;
    text-decoration: underline;
    text-underline-offset: 4px;
    cursor: pointer;
  }

  .mine-ghost {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 8px;
  }

  .mine-ghost span {
    display: block;
    width: 22%;
    height: 8px;
    border-radius: 4px;
    background: var(--color-surface-soft);
  }

  .mine-ghost span + span {
    width: 68%;
    height: 14px;
  }

  .mine-note {
    padding: 56px 12px;
    color: color-mix(in oklab, var(--color-text) 78%, transparent);
    font-family: var(--font-editorial);
    font-size: 17px;
    line-height: 1.55;
    text-align: center;
  }

  .mine-note p {
    margin: 0 0 8px;
  }

  .mine-soft {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .mine-more,
  .mine-foot {
    margin: 18px 0 0;
    text-align: center;
  }

  .mine-sentinel {
    height: 1px;
  }

  @media (max-width: 640px) {
    .mine-top {
      padding-left: 16px;
      padding-right: 16px;
    }

    .mine-body {
      padding: 4px 16px max(24px, env(safe-area-inset-bottom));
    }
  }
</style>
