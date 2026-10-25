<script lang="ts">
  import { onMount, untrack } from "svelte";
  import {
    loadDraft,
    submitPost,
    updatePost,
    type MinePost
  } from "../mine/mine-client";

  const MAX_TOPICS = 3;
  const TITLE_MAX = 280;
  const CLOSE_DISTANCE = 96;

  let {
    open,
    userId,
    userKnown,
    topics,
    edit,
    onClose,
    onSignIn,
    onSaved,
    onOpenPosts
  }: {
    open: boolean;
    userId: string | null;
    userKnown: boolean;
    topics: Array<{ key: string; label: string }>;
    /** Bai nhap dang sua; serial tang moi lan mo de tai lai ban moi nhat. */
    edit: { id: string; serial: number } | null;
    onClose: () => void;
    onSignIn: () => void;
    onSaved: () => void;
    onOpenPosts: () => void;
  } = $props();

  const uid = $props.id();
  const titleId = `write-title-${uid}`;
  const topicsId = `write-topics-${uid}`;
  const spaceTitleId = `write-space-title-${uid}`;

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
    if (
      event.target instanceof Element &&
      event.target.closest("button, textarea, input")
    ) {
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

  let title = $state("");
  let body = $state("");
  let chosen = $state<string[]>([]);
  let busy = $state(false);
  let error = $state("");
  let sent = $state<MinePost | null>(null);
  let editState = $state<"loading" | "ready" | "error">("ready");
  let editError = $state("");
  let edited = $state("");
  let owner: string | null = null;
  let editKey = "";

  let full = $derived(chosen.length >= MAX_TOPICS);

  function reset() {
    title = "";
    body = "";
    chosen = [];
    error = "";
    sent = null;
    edited = "";
    editState = "ready";
    editError = "";
  }

  // Doi tai khoan thi bo ban dang viet cua nguoi truoc.
  $effect(() => {
    if (userId === owner) return;
    owner = userId;
    reset();
  });

  async function startEdit(id: string, key: string) {
    editState = "loading";
    const result = await loadDraft(id);
    if (key !== editKey) return;

    if (!result.ok) {
      editState = "error";
      editError = result.message;
      return;
    }

    const known = new Set(topics.map((topic) => topic.key));
    title = result.draft.title;
    body = result.draft.body;
    chosen = result.draft.topics.filter((key) => known.has(key));
    editState = "ready";
  }

  // Mo de sua: tai ban nhap. Chuyen tu sua sang viet moi: bo trong form.
  $effect(() => {
    if (!open) return;

    const key = edit ? `${edit.id}:${edit.serial}` : "";
    if (key === editKey) return;
    editKey = key;

    untrack(() => {
      reset();
      if (edit) void startEdit(edit.id, key);
    });
  });

  function toggleTopic(key: string) {
    error = "";
    if (chosen.includes(key)) {
      chosen = chosen.filter((item) => item !== key);
    } else if (!full) {
      chosen = [...chosen, key];
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    if (!title.trim()) {
      error = "Hãy viết câu chữ chính.";
      return;
    }
    if (chosen.length === 0) {
      error = "Hãy chọn ít nhất 1 chủ đề.";
      return;
    }

    busy = true;
    error = "";

    const fields = { title, description: "", body, topics: chosen };

    if (edit) {
      const result = await updatePost(edit.id, fields);
      busy = false;

      if (!result.ok) {
        error = result.message;
        return;
      }

      const savedTitle = title.trim();
      reset();
      edited = savedTitle;
      onSaved();
      return;
    }

    const result = await submitPost(fields);
    busy = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    reset();
    sent = result.post;
    onSaved();
  }
</script>

<div
  class="write-space"
  class:shown
  class:dragging={dragPointer !== null}
  style:--write-drag="{dragY}px"
  aria-hidden={!open}
>
  <button
    type="button"
    class="write-veil"
    tabindex="-1"
    aria-label="Đóng không gian viết"
    onclick={onClose}
  ></button>

  <section
    class="write-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby={spaceTitleId}
    tabindex="-1"
    inert={!open}
    bind:this={panel}
  >
    <div
      class="write-top"
      onpointerdown={onGrabDown}
      onpointermove={onGrabMove}
      onpointerup={onGrabEnd}
      onpointercancel={onGrabEnd}
    >
      <p class="write-eyebrow">
        {edit ? "Chỉnh sửa bản nháp" : "Một khoảng yên để viết"}
      </p>
      <div class="write-head">
        <h2 id={spaceTitleId} class="write-title-hero">
          {edit ? "Sửa bài" : "Viết bài"}
        </h2>
        <button
          type="button"
          class="write-close"
          aria-label="Đóng"
          onclick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />
          </svg>
        </button>
      </div>
    </div>

  <div class="write-body">
    {#if !userKnown || (edit && editState === "loading")}
      <div class="write-ghost" aria-hidden="true">
        <span></span>
        <span></span>
      </div>
    {:else if !userId}
      <div class="write-note">
        <p>Cần có tài khoản để viết và giữ bài của bạn.</p>
        <button type="button" class="write-submit" onclick={onSignIn}>
          Đăng nhập hoặc tạo tài khoản
        </button>
      </div>
    {:else if edit && editState === "error"}
      <div class="write-note" aria-live="polite">
        <p>{editError}</p>
        <button type="button" class="write-submit" onclick={onOpenPosts}>
          Về «Đã viết»
        </button>
      </div>
    {:else if edited}
      <div class="write-note" aria-live="polite">
        <p class="write-done">Đã lưu thay đổi «{edited}».</p>
        <p class="write-soft">Bài vẫn đang chờ duyệt.</p>
        <button type="button" class="write-submit" onclick={onOpenPosts}>
          Xem trong «Đã viết»
        </button>
      </div>
    {:else if sent}
      <div class="write-note" aria-live="polite">
        <p class="write-done">Đã gửi «{sent.title}».</p>
        <p class="write-soft">
          Bài đang ở dạng bản nháp và sẽ hiện trên Bình Yên sau khi được duyệt.
        </p>
        <button type="button" class="write-submit" onclick={onOpenPosts}>
          Xem trong «Đã viết»
        </button>
        <button type="button" class="write-text" onclick={() => (sent = null)}>
          Viết bài khác
        </button>
      </div>
    {:else}
      <form class="write-form" onsubmit={submit} novalidate>
        <div class="write-field write-field-lead">
          <label for={titleId}>Câu chữ chính</label>
          <textarea
            id={titleId}
            class="write-lead"
            rows="3"
            maxlength={TITLE_MAX}
            placeholder="Điều bạn muốn kể…"
            bind:value={title}
          ></textarea>
          {#if title.length > TITLE_MAX - 40}
            <span class="write-count">{title.length}/{TITLE_MAX}</span>
          {/if}
        </div>

        <label class="write-field write-field-body">
          <span>Nội dung</span>
          <textarea
            class="write-prose"
            rows="10"
            maxlength="8000"
            placeholder="Không bắt buộc. Viết dài hơn nếu bạn muốn — không gian này là của bạn."
            bind:value={body}
          ></textarea>
        </label>

        <div class="write-field">
          <span id={topicsId}>Chủ đề (1–{MAX_TOPICS})</span>
          <div class="write-chips" role="group" aria-labelledby={topicsId}>
            {#each topics as topic (topic.key)}
              {@const on = chosen.includes(topic.key)}
              <button
                type="button"
                class="write-chip"
                class:on
                aria-pressed={on}
                disabled={!on && full}
                onclick={() => toggleTopic(topic.key)}
              >
                {topic.label}
              </button>
            {/each}
          </div>
        </div>

        <p class="write-error" aria-live="polite">{error}</p>

        <button type="submit" class="write-submit" disabled={busy}>
          {#if edit}
            {busy ? "Đang lưu…" : "Lưu thay đổi"}
          {:else}
            {busy ? "Đang gửi…" : "Gửi bài"}
          {/if}
        </button>
        <p class="write-soft write-center">
          {edit
            ? "Chỉ sửa được khi bài còn chờ duyệt."
            : "Bài được lưu thành bản nháp và hiện lên sau khi được duyệt."}
        </p>
      </form>
    {/if}
  </div>
  </section>
</div>

<style>
  .write-space {
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

  .write-space.shown {
    pointer-events: auto;
    visibility: visible;
    opacity: 1;
    transition:
      opacity 200ms ease,
      visibility 0s;
  }

  .write-veil {
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

  .write-panel {
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

  .write-space.shown .write-panel {
    transform: translateY(var(--write-drag, 0px));
    opacity: 1;
  }

  .write-space.dragging .write-panel {
    transition: none;
  }

  .write-top {
    flex: none;
    padding: 16px 18px 0;
    touch-action: none;
  }

  .write-eyebrow {
    margin: 0 0 8px;
    color: color-mix(in oklab, var(--color-text) 52%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .write-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 8px;
  }

  .write-title-hero {
    margin: 0;
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(1.7rem, 6vw, 2.35rem);
    font-weight: 500;
    letter-spacing: -0.04em;
    line-height: 1.05;
  }

  .write-close {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    margin-top: 6px;
    padding: 0;
    border: 1px solid color-mix(in oklab, var(--color-text) 18%, transparent);
    border-radius: 50%;
    background: color-mix(in oklab, var(--color-surface) 48%, transparent);
    color: var(--color-text);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
  }

  .write-close svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .write-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 28px max(36px, env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }

  .write-form {
    display: grid;
    gap: 28px;
    padding-top: 12px;
  }

  .write-field {
    position: relative;
    display: grid;
    gap: 8px;
  }

  .write-field > span:first-child,
  .write-field > label {
    color: color-mix(in oklab, var(--color-text) 58%, transparent);
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .write-field input,
  .write-field textarea {
    width: 100%;
    padding: 10px 0;
    border: 0;
    border-bottom: 1px solid
      color-mix(in oklab, var(--color-text) 12%, transparent);
    border-radius: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 17px;
    line-height: 1.65;
    outline: none;
    resize: vertical;
  }

  .write-field .write-lead {
    min-height: 4.2em;
    border-bottom-color: color-mix(
      in oklab,
      var(--color-text) 18%,
      transparent
    );
    font-family: var(--font-editorial);
    font-size: clamp(1.45rem, 4.5vw, 1.85rem);
    line-height: 1.35;
    letter-spacing: -0.02em;
    resize: none;
  }

  .write-field .write-prose {
    min-height: 12em;
    padding: 18px 20px;
    border: 1px solid color-mix(in oklab, var(--color-text) 10%, transparent);
    border-radius: 22px;
    background: color-mix(in oklab, var(--color-surface) 38%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    resize: vertical;
  }

  .write-field input:focus,
  .write-field textarea:focus {
    border-bottom-color: color-mix(
      in oklab,
      var(--color-primary) 65%,
      transparent
    );
  }

  .write-field .write-prose:focus {
    border-color: color-mix(in oklab, var(--color-primary) 45%, transparent);
    border-bottom-color: color-mix(
      in oklab,
      var(--color-primary) 45%,
      transparent
    );
  }

  .write-field input::placeholder,
  .write-field textarea::placeholder {
    color: color-mix(in oklab, var(--color-text) 38%, transparent);
  }

  .write-count {
    justify-self: end;
    color: var(--color-text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .write-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .write-chip {
    min-height: 36px;
    padding: 6px 15px;
    border: 1px solid color-mix(in oklab, var(--color-text) 14%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-surface) 30%, transparent);
    color: var(--color-chip);
    font: inherit;
    font-size: 14px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
    transition:
      background 160ms ease,
      border-color 160ms ease,
      color 160ms ease,
      opacity 160ms ease;
  }

  .write-chip.on {
    border-color: var(--color-chip-active-line);
    background: var(--color-chip-active-bg);
    color: var(--color-chip-active);
  }

  .write-chip:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .write-error {
    min-height: 18px;
    margin: 0;
    color: var(--color-error);
    font-size: 13px;
    line-height: 1.4;
  }

  .write-submit {
    display: block;
    width: 100%;
    max-width: 280px;
    min-height: 48px;
    margin-inline: auto;
    justify-self: center;
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

  .write-submit:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .write-submit:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .write-text {
    display: block;
    margin: 6px auto 0;
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

  .write-note {
    padding: 56px 12px;
    color: color-mix(in oklab, var(--color-text) 78%, transparent);
    font-family: var(--font-editorial);
    font-size: 17px;
    line-height: 1.55;
    text-align: center;
  }

  .write-note p {
    margin: 0 0 14px;
  }

  .write-done {
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: clamp(1.35rem, 4vw, 1.7rem);
    line-height: 1.35;
  }

  .write-soft {
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.5;
  }

  .write-note .write-soft {
    margin-bottom: 22px;
  }

  .write-center {
    margin: -8px 0 0;
    text-align: center;
  }

  .write-ghost {
    display: grid;
    gap: 10px;
    padding: 18px 0 40px;
  }

  .write-ghost span {
    height: 14px;
    border-radius: 7px;
    background: color-mix(in oklab, var(--color-surface) 55%, transparent);
  }

  .write-ghost span + span {
    width: 60%;
  }

  @media (max-width: 640px) {
    .write-top {
      padding-left: 18px;
      padding-right: 18px;
    }

    .write-body {
      padding: 8px 18px max(28px, env(safe-area-inset-bottom));
    }

    .write-field .write-prose {
      padding: 16px;
      border-radius: 18px;
    }
  }
</style>
