<script lang="ts">
  import { onMount } from "svelte";
  import {
    loadProfile,
    saveProfile,
    signOut,
    submitAuth,
    type AccountUser,
    type TopicChoice
  } from "./account-client";

  type Mode = "login" | "register";

  let {
    open,
    user,
    userKnown,
    onClose,
    onSignedIn,
    onSignedOut,
    onOpenMine,
    onProfileSaved
  }: {
    open: boolean;
    user: AccountUser | null;
    userKnown: boolean;
    onClose: () => void;
    onSignedIn: (user: AccountUser) => void;
    onSignedOut: () => void;
    onOpenMine: () => void;
    onProfileSaved: (user: AccountUser, topicsChanged: boolean) => void;
  } = $props();

  const modes: Array<{ key: Mode; label: string }> = [
    { key: "login", label: "Đăng nhập" },
    { key: "register", label: "Tạo tài khoản" }
  ];

  const CLOSE_DISTANCE = 96;
  const uid = $props.id();
  const passwordId = `acc-password-${uid}`;
  const topicsId = `acc-topics-${uid}`;
  const titleId = `acc-space-title-${uid}`;

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

  let editing = $state(false);
  let editStatus = $state<"loading" | "ready" | "error">("loading");
  let editName = $state("");
  let topicChoices = $state<TopicChoice[]>([]);
  let chosen = $state<string[]>([]);
  let loadedChosen = "";
  let saved = $state(false);

  function topicKey(slugs: string[]): string {
    return [...slugs].sort().join(".");
  }

  let mode = $state<Mode>("login");
  let displayName = $state("");
  let email = $state("");
  let password = $state("");
  let reveal = $state(false);
  let busy = $state(false);
  let error = $state("");

  let initial = $derived(
    (user?.displayName.trim().charAt(0) || "·").toLocaleUpperCase("vi")
  );

  function chooseMode(key: Mode) {
    mode = key;
    error = "";
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    busy = true;
    error = "";

    const fields: Record<string, string> = { email, password };
    if (mode === "register" && displayName.trim()) {
      fields.displayName = displayName.trim();
    }

    const result = await submitAuth(mode, fields);
    busy = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    password = "";
    reveal = false;
    onSignedIn(result.user);
  }

  async function startEdit() {
    if (!user) return;

    editing = true;
    editStatus = "loading";
    editName = user.displayName;
    error = "";
    saved = false;

    const profile = await loadProfile();
    if (!editing) return;

    if (!profile) {
      editStatus = "error";
      return;
    }

    editName = profile.displayName;
    topicChoices = profile.topics;
    chosen = profile.topics
      .filter((topic) => topic.chosen)
      .map((topic) => topic.slug);
    loadedChosen = topicKey(chosen);
    editStatus = "ready";
  }

  function toggleTopic(slug: string) {
    chosen = chosen.includes(slug)
      ? chosen.filter((item) => item !== slug)
      : [...chosen, slug];
  }

  async function saveEdit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    busy = true;
    error = "";

    const result = await saveProfile(editName, chosen);
    busy = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    editing = false;
    saved = true;
    onProfileSaved(result.user, topicKey(chosen) !== loadedChosen);
  }

  function cancelEdit() {
    editing = false;
    error = "";
  }

  // Dong ngan hoac doi nguoi dung thi bo phan dang sua.
  $effect(() => {
    if (!open || !user) editing = false;
    if (!open) saved = false;
  });

  async function leave() {
    if (busy) return;

    busy = true;
    const ok = await signOut();
    busy = false;

    if (ok) {
      error = "";
      mode = "login";
      onSignedOut();
    } else {
      error = "Chưa đăng xuất được. Hãy thử lại.";
    }
  }
</script>

<div
  class="acc-space"
  class:shown
  class:dragging={dragPointer !== null}
  style:--acc-drag="{dragY}px"
  aria-hidden={!open}
>
  <button
    type="button"
    class="acc-veil"
    tabindex="-1"
    aria-label="Đóng không gian tài khoản"
    onclick={onClose}
  ></button>

  <section
    class="acc-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    inert={!open}
    bind:this={panel}
  >
    <div
      class="acc-top"
      onpointerdown={onGrabDown}
      onpointermove={onGrabMove}
      onpointerup={onGrabEnd}
      onpointercancel={onGrabEnd}
    >
      <p class="acc-eyebrow">Không gian cá nhân</p>
      <div class="acc-head">
        <h2 id={titleId} class="acc-title-hero">Tài khoản</h2>
        <button
          type="button"
          class="acc-close"
          aria-label="Đóng"
          onclick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />
          </svg>
        </button>
      </div>
    </div>

  <div class="acc-body">
    {#if !userKnown}
      <div class="acc-ghost" aria-hidden="true">
        <span></span>
        <span></span>
      </div>
    {:else if user && editing}
      <form class="acc-form acc-edit" onsubmit={saveEdit} novalidate>
        <label class="acc-field">
          <span>Tên hiển thị</span>
          <input
            type="text"
            name="name"
            autocomplete="nickname"
            maxlength="60"
            required
            bind:value={editName}
          />
        </label>

        <div class="acc-field">
          <span id={topicsId}>Chủ đề bạn thích</span>
          {#if editStatus === "loading"}
            <div class="acc-chips" aria-hidden="true">
              {#each [0, 1, 2, 3, 4] as index (index)}
                <span class="acc-chip acc-chip-ghost"></span>
              {/each}
            </div>
          {:else if editStatus === "error"}
            <p class="acc-soft">
              Chưa tải được danh sách chủ đề.
              <button type="button" class="acc-inline" onclick={startEdit}>
                Thử lại
              </button>
            </p>
          {:else}
            <div class="acc-chips" role="group" aria-labelledby={topicsId}>
              {#each topicChoices as topic (topic.slug)}
                <button
                  type="button"
                  class="acc-chip"
                  class:on={chosen.includes(topic.slug)}
                  aria-pressed={chosen.includes(topic.slug)}
                  onclick={() => toggleTopic(topic.slug)}
                >
                  {topic.label}
                </button>
              {/each}
            </div>
            <p class="acc-soft">Chọn vài chủ đề để Bình Yên hiểu bạn hơn.</p>
          {/if}
        </div>

        <p class="acc-error" aria-live="polite">{error}</p>

        <button
          type="submit"
          class="acc-submit"
          disabled={busy || editStatus !== "ready"}
        >
          {busy ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
        <button type="button" class="acc-text" onclick={cancelEdit}>
          Huỷ
        </button>
      </form>
    {:else if user}
      <div class="acc-profile">
        <span class="acc-avatar" aria-hidden="true">{initial}</span>
        <div class="acc-who">
          <p class="acc-name">{user.displayName}</p>
          <p class="acc-email">{user.email}</p>
        </div>
      </div>

      <ul class="acc-links">
        <li>
          <button type="button" class="acc-link" onclick={onOpenMine}>
            <span>Của tôi</span>
            <span class="acc-hint">Đã thích, đã lưu, đã viết</span>
          </button>
        </li>
        <li>
          <button type="button" class="acc-link" onclick={startEdit}>
            <span>Chỉnh sửa hồ sơ & chủ đề</span>
            <span class="acc-hint" aria-live="polite">
              {saved ? "Đã lưu" : "Tên, chủ đề"}
            </span>
          </button>
        </li>
      </ul>

      <p class="acc-error" aria-live="polite">{error}</p>

      <button
        type="button"
        class="acc-text"
        disabled={busy}
        onclick={leave}
      >
        {busy ? "Đang đăng xuất…" : "Đăng xuất"}
      </button>
    {:else}
      <div class="acc-modes" role="tablist" aria-label="Tài khoản">
        {#each modes as item (item.key)}
          <button
            type="button"
            role="tab"
            class="acc-mode"
            class:active={mode === item.key}
            aria-selected={mode === item.key}
            onclick={() => chooseMode(item.key)}
          >
            {item.label}
          </button>
        {/each}
      </div>

      <form class="acc-form" onsubmit={submit} novalidate>
        {#if mode === "register"}
          <label class="acc-field">
            <span>Tên hiển thị</span>
            <input
              type="text"
              name="name"
              autocomplete="nickname"
              maxlength="60"
              placeholder="Không bắt buộc"
              bind:value={displayName}
            />
          </label>
        {/if}

        <label class="acc-field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            autocapitalize="off"
            spellcheck="false"
            required
            bind:value={email}
          />
        </label>

        <div class="acc-field">
          <label for={passwordId}>Mật khẩu</label>
          <span class="acc-pass">
            <input
              id={passwordId}
              type={reveal ? "text" : "password"}
              name="password"
              autocomplete={mode === "login"
                ? "current-password"
                : "new-password"}
              minlength="8"
              maxlength="200"
              required
              bind:value={password}
            />
            <button
              type="button"
              class="acc-reveal"
              aria-label="Hiện mật khẩu"
              aria-pressed={reveal}
              onclick={() => (reveal = !reveal)}
            >
              {reveal ? "Ẩn" : "Hiện"}
            </button>
          </span>
        </div>

        <p class="acc-error" aria-live="polite">{error}</p>

        <button type="submit" class="acc-submit" disabled={busy}>
          {#if busy}
            Đang xử lý…
          {:else}
            {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          {/if}
        </button>
      </form>

      <p class="acc-note">
        Lượt thích và bài đã lưu trên trình duyệt này sẽ được giữ trong tài
        khoản.
      </p>
    {/if}
  </div>
  </section>
</div>

<style>
  .acc-space {
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

  .acc-space.shown {
    pointer-events: auto;
    visibility: visible;
    opacity: 1;
    transition:
      opacity 200ms ease,
      visibility 0s;
  }

  .acc-veil {
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

  .acc-panel {
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

  .acc-space.shown .acc-panel {
    transform: translateY(var(--acc-drag, 0px));
    opacity: 1;
  }

  .acc-space.dragging .acc-panel {
    transition: none;
  }

  .acc-top {
    flex: none;
    padding: 16px 18px 0;
    touch-action: none;
  }

  .acc-eyebrow {
    margin: 0 0 6px;
    color: color-mix(in oklab, var(--color-text) 55%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .acc-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
  }

  .acc-title-hero {
    margin: 0;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(1.7rem, 6vw, 2.35rem);
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  .acc-close {
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

  .acc-close svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .acc-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px 22px max(28px, env(safe-area-inset-bottom));
    overscroll-behavior: contain;
    mask-image: linear-gradient(
      to bottom,
      transparent,
      #000 12px,
      #000 calc(100% - 28px),
      transparent
    );
  }

  .acc-modes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 20px;
  }

  .acc-mode {
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

  .acc-mode.active {
    border-color: color-mix(in oklab, var(--color-text) 28%, transparent);
    background: color-mix(in oklab, var(--color-surface) 58%, transparent);
    color: var(--color-text);
    font-weight: 650;
  }

  .acc-form {
    display: grid;
    gap: 14px;
  }

  .acc-field {
    display: grid;
    gap: 4px;
  }

  .acc-field > span:first-child,
  .acc-field > label {
    color: var(--color-eyebrow);
    font-size: 12px;
    letter-spacing: 0.02em;
  }

  .acc-field input {
    width: 100%;
    padding: 10px 0;
    border: 0;
    border-bottom: 1px solid
      color-mix(in oklab, var(--color-text) 16%, transparent);
    border-radius: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 16px;
    outline: none;
  }

  .acc-field input:focus {
    border-bottom-color: color-mix(
      in oklab,
      var(--color-primary) 70%,
      transparent
    );
  }

  .acc-field input::placeholder {
    color: var(--color-text-muted);
  }

  .acc-pass {
    position: relative;
    display: block;
  }

  .acc-pass input {
    padding-right: 52px;
  }

  .acc-reveal {
    position: absolute;
    top: 50%;
    right: 0;
    padding: 6px 2px;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transform: translateY(-50%);
  }

  .acc-error {
    min-height: 18px;
    margin: 0;
    color: var(--color-error);
    font-size: 13px;
    line-height: 1.4;
  }

  .acc-submit {
    width: 100%;
    min-height: 46px;
    border: 0;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--color-sheet);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 160ms ease;
  }

  .acc-submit:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .acc-submit:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .acc-note {
    margin: 16px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
  }

  .acc-profile {
    display: flex;
    gap: 16px;
    align-items: center;
    margin: 4px 0 22px;
  }

  .acc-avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 64px;
    height: 64px;
    border: 1px solid color-mix(in oklab, var(--color-text) 16%, transparent);
    border-radius: 50%;
    background: color-mix(in oklab, var(--color-surface) 48%, transparent);
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 26px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .acc-who {
    min-width: 0;
  }

  .acc-who p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .acc-name {
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 24px;
    letter-spacing: -0.02em;
  }

  .acc-email {
    margin-top: 2px;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .acc-links {
    margin: 0 0 10px;
    padding: 0;
    list-style: none;
  }

  .acc-links li {
    border-bottom: 1px solid
      color-mix(in oklab, var(--color-text) 10%, transparent);
  }

  .acc-links li:first-child {
    border-top: 1px solid
      color-mix(in oklab, var(--color-text) 10%, transparent);
  }

  .acc-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 16px 0;
    border: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 15px;
    text-align: left;
    cursor: pointer;
  }

  .acc-link:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }

  .acc-hint {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .acc-text {
    display: block;
    margin: 4px auto 0;
    padding: 10px 14px;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .acc-edit {
    margin-top: 10px;
  }

  .acc-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }

  .acc-chip {
    min-height: 34px;
    padding: 6px 14px;
    border: 1px solid color-mix(in oklab, var(--color-text) 14%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-surface) 24%, transparent);
    color: var(--color-chip);
    font: inherit;
    font-size: 14px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
    transition:
      background 160ms ease,
      border-color 160ms ease,
      color 160ms ease;
  }

  .acc-chip.on {
    border-color: var(--color-chip-active-line);
    background: var(--color-chip-active-bg);
    color: var(--color-chip-active);
  }

  .acc-chip-ghost {
    width: 84px;
    border-color: transparent;
    background: var(--color-surface-soft);
  }

  .acc-soft {
    margin: 8px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .acc-inline {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .acc-ghost {
    display: grid;
    gap: 10px;
    padding: 18px 0 40px;
  }

  .acc-ghost span {
    height: 14px;
    border-radius: 7px;
    background: var(--color-surface-soft);
  }

  .acc-ghost span + span {
    width: 60%;
  }

  @media (max-width: 640px) {
    .acc-top {
      padding-left: 16px;
      padding-right: 16px;
    }

    .acc-body {
      padding: 8px 16px max(24px, env(safe-area-inset-bottom));
    }
  }
</style>
